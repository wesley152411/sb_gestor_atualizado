import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestAccount, setEmailConfirmed, api, post, cleanupAccounts, prisma, type TestAccount } from './helpers';

let A: TestAccount;
let B: TestAccount;
let C: TestAccount;

beforeAll(async () => {
  [A, B, C] = await Promise.all([
    createTestAccount('A'),
    createTestAccount('B'),
    createTestAccount('C'),
  ]);
  // Dados só da conta A: um cliente e um evento.
  await post('/api/clients', A.cookie, { id: `cli_${Date.now()}`, name: 'Cliente de A', phone: '11999990000' });
  await post('/api/party-events', A.cookie, { id: `evt_${Date.now()}`, client_name: 'Festa de A', event_date: '2026-09-01', status: 'Pendente' });
});

afterAll(async () => {
  await cleanupAccounts([A?.id, B?.id, C?.id].filter(Boolean) as string[]);
  await prisma.$disconnect();
});

describe('Isolamento multi-conta', () => {
  it('401 em todas as rotas sensíveis sem sessão', async () => {
    const paths = ['/api/clients', '/api/party-events', '/api/inventory', '/api/kits', '/api/orders', '/api/calendar?year=2026&month=9', '/api/decorators/me'];
    for (const p of paths) {
      const r = await api(p, null);
      expect(r.status, `sem sessão: ${p}`).toBe(401);
    }
  });

  it('A vê os próprios clientes; B não vê nenhum de A', async () => {
    const da = await (await api('/api/clients', A.cookie)).json();
    expect(da.length).toBeGreaterThan(0);
    expect(da.every((c: any) => c.decorator_id === A.id)).toBe(true);

    const db = await (await api('/api/clients', B.cookie)).json();
    expect(db.some((c: any) => c.decorator_id === A.id)).toBe(false);
  });

  it('parâmetro forjado não vaza: B pedindo ?decoratorId=A não traz dados de A', async () => {
    const d = await (await api(`/api/clients?decoratorId=${A.id}`, B.cookie)).json();
    expect(d.some((c: any) => c.decorator_id === A.id)).toBe(false);

    const ev = await (await api(`/api/party-events?decoratorId=${A.id}`, B.cookie)).json();
    expect(ev.length).toBe(0);
  });

  it('chat: C não lê a conversa entre A e B (403), mesmo forjando os ids', async () => {
    const r = await api(`/api/chats?decoratorA=${A.id}&decoratorB=${B.id}`, C.cookie);
    expect(r.status).toBe(403);
  });

  it('chat: remetente é sempre a sessão (não posta em nome de outra conta)', async () => {
    // B envia msg para C, mas tenta forjar sender_id = A no corpo.
    await post('/api/chats', B.cookie, { id: `msg_${Date.now()}`, sender_id: A.id, receiver_id: C.id, message: 'oi de B' });

    // Conversa C<->B: existe e o remetente gravado é B (não A).
    const mCB = await (await api(`/api/chats?decoratorA=${C.id}&decoratorB=${B.id}`, C.cookie)).json();
    expect(mCB.length).toBeGreaterThan(0);
    expect(mCB.every((m: any) => m.sender_id === B.id || m.receiver_id === B.id)).toBe(true);

    // Conversa C<->A: NÃO deve conter a mensagem (o servidor ignorou o sender forjado).
    const mCA = await (await api(`/api/chats?decoratorA=${C.id}&decoratorB=${A.id}`, C.cookie)).json();
    expect(mCA.length).toBe(0);
  });

  it('DELETE de item alheio é bloqueado (403) e o próprio dono consegue (200)', async () => {
    const itemId = `itm_${Date.now()}`;
    await post('/api/inventory', A.cookie, { id: itemId, name: 'Peça de A', status: 'Privado', stock_quantity: 1, rental_price: 10 });

    const blocked = await api(`/api/inventory/${itemId}`, B.cookie, { method: 'DELETE' });
    expect(blocked.status).toBe(403);

    const ok = await api(`/api/inventory/${itemId}`, A.cookie, { method: 'DELETE' });
    expect(ok.status).toBe(200);
  });

  it('feed do Marketplace: item público de A aparece para B, mas item privado não', async () => {
    const pubId = `pub_${Date.now()}`;
    const privId = `prv_${Date.now()}`;
    await post('/api/inventory', A.cookie, { id: pubId, name: 'Publica de A', status: 'Público', stock_quantity: 2, rental_price: 20 });
    await post('/api/inventory', A.cookie, { id: privId, name: 'Privada de A', status: 'Privado', stock_quantity: 2, rental_price: 20 });

    // B pede o feed (sem decoratorId): vê a pública de A, não a privada, e não a própria.
    const feed = await (await api('/api/inventory', B.cookie)).json();
    const ids = feed.map((i: any) => i.id);
    expect(ids).toContain(pubId);
    expect(ids).not.toContain(privId);
    expect(feed.every((i: any) => i.decorator_id !== B.id)).toBe(true);
  });

  it('is_internal: some da vitrine, mas a flag NÃO é privilégio (segue 401/403)', async () => {
    // Conta interna criada como qualquer outra; a flag só é ligada DIRETO no banco
    // (nenhuma rota escreve). Ela dá dados próprios para provar o isolamento.
    const D = await createTestAccount('D');
    await post('/api/clients', D.cookie, { id: `cliD_${Date.now()}`, name: 'Cliente de D', phone: '11888880000' });
    await prisma.decorator.update({ where: { id: D.id }, data: { is_internal: true } });

    // LADO 1 — sumiu da vitrine pública, mas contas normais continuam listadas.
    const list = await (await api('/api/decorators', A.cookie)).json();
    const listIds = list.map((d: any) => d.id);
    expect(listIds).not.toContain(D.id);   // interna não aparece
    expect(listIds).toContain(A.id);       // controle: conta normal aparece

    // LADO 2 — a flag não virou privilégio: os MESMOS bloqueios das demais contas.
    // 2a) sem sessão continua 401
    expect((await api('/api/clients', null)).status).toBe(401);
    // 2b) D não lê dados de A (isolamento intacto)
    const dSeesA = await (await api(`/api/clients?decoratorId=${A.id}`, D.cookie)).json();
    expect(dSeesA.some((c: any) => c.decorator_id === A.id)).toBe(false);
    // 2c) A não lê dados de D (a conta interna não é "aberta")
    const aSeesD = await (await api(`/api/clients?decoratorId=${D.id}`, A.cookie)).json();
    expect(aSeesD.some((c: any) => c.decorator_id === D.id)).toBe(false);
    // 2d) D não apaga item de A (403), mesmo sendo interna
    const itmId = `itmAD_${Date.now()}`;
    await post('/api/inventory', A.cookie, { id: itmId, name: 'Peça de A', status: 'Privado', stock_quantity: 1, rental_price: 10 });
    expect((await api(`/api/inventory/${itmId}`, D.cookie, { method: 'DELETE' })).status).toBe(403);
    await api(`/api/inventory/${itmId}`, A.cookie, { method: 'DELETE' }); // limpa

    // LADO 3 — a flag não é setável pela API: A tentar virar interna não persiste.
    await post('/api/decorators', A.cookie, { id: A.id, is_internal: true });
    const aRow = await prisma.decorator.findUnique({ where: { id: A.id } });
    expect(aRow?.is_internal).toBe(false);

    await cleanupAccounts([D.id]);
  });

  it('conta com e-mail NÃO confirmado é recusada pelas rotas de dados (servidor)', async () => {
    // createTestAccount confirma + loga; aqui desconfirmamos para simular quem
    // tem sessão mas ainda não clicou no link.
    const U = await createTestAccount('U');
    await setEmailConfirmed(U.id, false);

    // Rotas de dados recusam a sessão não confirmada, igual a sem sessão (401).
    for (const p of ['/api/clients', '/api/party-events', '/api/inventory', '/api/kits']) {
      const r = await api(p, U.cookie);
      expect(r.status, `não confirmado: ${p}`).toBe(401);
    }
    // Criação preguiçosa do perfil NÃO roda para conta não confirmada (403).
    const me = await post('/api/decorators/me', U.cookie, {});
    expect(me.status).toBe(403);

    // Depois de confirmar (equivale ao clique no link), passa a funcionar.
    await setEmailConfirmed(U.id, true);
    const okClients = await api('/api/clients', U.cookie);
    expect(okClients.status).toBe(200);

    await cleanupAccounts([U.id]);
  });
});
