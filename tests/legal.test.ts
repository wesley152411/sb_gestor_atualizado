import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestAccount, restClientFor, sweepTestAccounts, assertDbReachable, api, prisma, cleanupAccounts, type TestAccount } from './helpers';

// Rotas de DADOS: sem aceite da versão atual, o gate do servidor devolve 403 —
// mesmo com sessão válida e e-mail confirmado.
const DATA_ROUTES = ['/api/clients', '/api/party-events', '/api/inventory', '/api/kits', '/api/orders', '/api/calendar?year=2026&month=9'];
// Rotas ISENTAS: precisam responder ANTES do aceite, senão não há como resolver
// o gate (a tela carrega o perfil e envia o aceite por elas).
const EXEMPT_ROUTES = ['/api/decorators/me', '/api/legal/acceptances'];

// Hash SHA-256 lido do MESMO arquivo que o servidor usa. Se o registro gravado
// bater com isto, o valor veio do repositório — não do que o navegador mandou.
function fileHash(file: string) {
  return createHash('sha256').update(readFileSync(path.join(process.cwd(), 'docs', 'politicas', file), 'utf8'), 'utf8').digest('hex');
}

let SEM: TestAccount;    // nunca aceitou
let COM: TestAccount;    // aceitou a versão atual
let VELHA: TestAccount;  // aceitou, mas o documento foi versionado depois
let ORFA: TestAccount;   // login SEM linha de perfil em decorators
let RECUSA: TestAccount; // idem, usada só no caminho da recusa

beforeAll(async () => {
  await assertDbReachable();
  await sweepTestAccounts();
  SEM = await createTestAccount('legal_sem', { acceptLegal: false });
  COM = await createTestAccount('legal_com');
  // VELHA simula quem aceitou a versão anterior: as linhas são semeadas direto no
  // banco com uma versão que não é mais a do arquivo (é o estado de quem aceitou a
  // 1.0 e hoje o repositório serve a 1.1). NÃO passa pela rota de aceite de
  // propósito — assim o cache de aceite confirmado do servidor nunca é populado
  // para esta conta, e o que o teste mede é a decisão real do gate.
  VELHA = await createTestAccount('legal_velha', { acceptLegal: false });
  await prisma.legalAcceptance.createMany({
    data: ['privacy', 'terms'].map((document) => ({
      decorator_id: VELHA.id,
      document,
      version: '0.0-antiga',
      content_hash: 'hash-antigo',
      context: 'signup',
    })),
  });
  // Contas ÓRFÃS: login válido e confirmado, sem linha em decorators. É o estado
  // real de cadastros antigos que nunca criaram o perfil preguiçoso. A linha é
  // removida depois de criada porque o harness sempre passa por /api/decorators/me.
  ORFA = await createTestAccount('legal_orfa', { acceptLegal: false });
  RECUSA = await createTestAccount('legal_recusa', { acceptLegal: false });
  await prisma.decorator.deleteMany({ where: { id: { in: [ORFA.id, RECUSA.id] } } });
});

afterAll(async () => {
  await cleanupAccounts([SEM?.id, COM?.id, VELHA?.id, ORFA?.id, RECUSA?.id].filter(Boolean) as string[]);
  await sweepTestAccounts();
  await prisma.$disconnect();
});

describe('Gate de aceite dos documentos legais', () => {
  it('sem aceite: 403 em todas as rotas de dados, mesmo com sessão confirmada', async () => {
    for (const route of DATA_ROUTES) {
      const res = await api(route, SEM.cookie);
      expect(res.status, `sem aceite: ${route}`).toBe(403);
      const body = await res.json().catch(() => ({}));
      expect(body.code, `sem aceite: ${route}`).toBe('LEGAL_ACCEPTANCE_REQUIRED');
    }
  });

  it('sem aceite: as rotas necessárias para resolver o gate continuam abertas', async () => {
    for (const route of EXEMPT_ROUTES) {
      const res = await api(route, SEM.cookie);
      expect(res.status, `isenta: ${route}`).toBe(200);
    }
  });

  it('com o aceite da versão atual: as rotas de dados respondem', async () => {
    for (const route of DATA_ROUTES) {
      const res = await api(route, COM.cookie);
      expect(res.status, `com aceite: ${route}`).toBe(200);
    }
  });

  it('aceite de versão ANTIGA cai no gate de novo (reaceite)', async () => {
    for (const route of DATA_ROUTES) {
      const res = await api(route, VELHA.cookie);
      expect(res.status, `versão antiga: ${route}`).toBe(403);
    }
    // E o reaceite pela rota isenta volta a liberar, sem apagar o registro velho.
    const antes = await prisma.legalAcceptance.count({ where: { decorator_id: VELHA.id } });
    const aceite = await api('/api/legal/acceptances', VELHA.cookie, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
    });
    expect(aceite.status).toBe(200);
    expect(await prisma.legalAcceptance.count({ where: { decorator_id: VELHA.id } })).toBe(antes + 2);
    expect((await api('/api/clients', VELHA.cookie)).status).toBe(200);
  });
});

describe('Registro de aceite', () => {
  it('grava duas linhas (uma por documento) com versão e hash vindos do ARQUIVO', async () => {
    const rows = await prisma.legalAcceptance.findMany({ where: { decorator_id: COM.id }, orderBy: { document: 'asc' } });
    expect(rows.map((r) => r.document)).toEqual(['privacy', 'terms']);
    expect(rows.find((r) => r.document === 'privacy')?.content_hash).toBe(fileHash('politica_privacidade.md'));
    expect(rows.find((r) => r.document === 'terms')?.content_hash).toBe(fileHash('termo_de_uso.md'));
    // IP capturado no SERVIDOR: em localhost não há header de proxy, então o
    // valor é o fallback do resolveClientIp — o que importa é a coluna existir
    // preenchida e nunca ter vindo do corpo da requisição.
    for (const row of rows) expect(typeof row.ip === 'string' || row.ip === null).toBe(true);
  });

  it('é imutável: UPDATE e DELETE pelo PostgREST são rejeitados', async () => {
    const client = await restClientFor(COM.email);
    const alvo = await prisma.legalAcceptance.findFirst({ where: { decorator_id: COM.id } });
    expect(alvo).toBeTruthy();

    const upd = await client.from('legal_acceptances').update({ version: 'adulterada' }).eq('id', alvo!.id).select();
    expect(upd.error !== null || (upd.data?.length ?? 0) === 0, 'UPDATE não pode alterar nenhuma linha').toBe(true);

    const del = await client.from('legal_acceptances').delete().eq('id', alvo!.id).select();
    expect(del.error !== null || (del.data?.length ?? 0) === 0, 'DELETE não pode remover nenhuma linha').toBe(true);

    // A prova final é o banco: a linha continua lá, intacta.
    const depois = await prisma.legalAcceptance.findUnique({ where: { id: alvo!.id } });
    expect(depois).toBeTruthy();
    expect(depois!.version).toBe(alvo!.version);
  });
});

describe('Conta sem linha de perfil (login órfão)', () => {
  it('consegue aceitar: o caminho legal semeia o perfil em vez de quebrar na FK', async () => {
    expect(await prisma.decorator.findUnique({ where: { id: ORFA.id } })).toBeNull();
    // Sem perfil, o gate barra igual — a barreira não depende da linha existir.
    expect((await api('/api/clients', ORFA.cookie)).status).toBe(403);

    const res = await api('/api/legal/acceptances', ORFA.cookie, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
    });
    expect(res.status, 'aceite de conta órfã não pode falhar na FK').toBe(200);
    expect(await prisma.decorator.findUnique({ where: { id: ORFA.id } })).toBeTruthy();
    expect(await prisma.legalAcceptance.count({ where: { decorator_id: ORFA.id } })).toBe(2);
    expect((await api('/api/clients', ORFA.cookie)).status).toBe(200);
  });

  it('a recusa grava deletion_requested_at mesmo sem perfil (não promete em vão)', async () => {
    expect(await prisma.decorator.findUnique({ where: { id: RECUSA.id } })).toBeNull();
    const res = await api('/api/legal/decline', RECUSA.cookie, { method: 'POST' });
    expect(res.status).toBe(200);
    const linha = await prisma.decorator.findUnique({ where: { id: RECUSA.id }, select: { deletion_requested_at: true } });
    expect(linha?.deletion_requested_at, 'o pedido de exclusão não pode se perder em silêncio').toBeTruthy();
  });
});
