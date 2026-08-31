import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestAccount, sweepTestAccounts, assertDbReachable, api, post, cleanupAccounts, prisma,
  type TestAccount,
} from './helpers';

// Fluxo de assinatura de ponta a ponta contra o SANDBOX do Mercado Pago: cria
// preapproval de verdade pela nossa rota, confere o que gravamos e cancela no fim.
//
// PULA quando não há credencial (o CI não tem os secrets do MP). Melhor pular
// visivelmente do que fingir cobertura.
const TOKEN = process.env.MP_ACCESS_TOKEN || '';
const SEM_MP = !TOKEN;

// GUARDA DE SANDBOX. Dois jeitos legítimos de estar em teste: token 'TEST-' da
// própria aplicação, ou credencial de um usuário de teste (tag test_user em
// /users/me). Produção é o que sobra — e aí este arquivo NÃO roda.
async function ehSandbox(): Promise<{ ok: boolean; conta: string }> {
  if (TOKEN.startsWith('TEST-')) return { ok: true, conta: '(credenciais de teste da aplicação)' };
  const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${TOKEN}` } });
  const d = await r.json().catch(() => ({}));
  return { ok: Boolean(d?.tags?.includes('test_user')), conta: d?.nickname ?? '(desconhecida)' };
}

async function cancelarNoMp(preapprovalId: string) {
  await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  }).catch(() => { /* limpeza best-effort */ });
}

let A: TestAccount;
let B: TestAccount;
const criadas: string[] = [];

beforeAll(async () => {
  if (SEM_MP) return;
  const sandbox = await ehSandbox();
  if (!sandbox.ok) {
    throw new Error(
      `🛑 ABORTADO: MP_ACCESS_TOKEN não é de sandbox (conta ${sandbox.conta}). ` +
      'Este teste CRIA assinaturas — com credencial de produção, criaria cobrança real.',
    );
  }
  await assertDbReachable();
  await sweepTestAccounts();
  [A, B] = await Promise.all([createTestAccount('bill_a'), createTestAccount('bill_b')]);
  // O CNPJ é a âncora do teste grátis; sem ele a decoradora não é elegível.
  await prisma.decorator.update({ where: { id: A.id }, data: { cnpj: '53592299000187' } });
});

afterAll(async () => {
  if (SEM_MP) return;
  for (const id of criadas) await cancelarNoMp(id);
  await cleanupAccounts([A?.id, B?.id].filter(Boolean) as string[]);
  await sweepTestAccounts();
  await prisma.$disconnect();
});

describe.skipIf(SEM_MP)('POST /api/billing/subscribe', () => {
  it('cria a preapproval no Mercado Pago e devolve o init_point', async () => {
    const res = await post('/api/billing/subscribe', A.cookie, {});
    expect(res.status, 'a rota deve criar a assinatura').toBe(200);
    const corpo = await res.json();
    expect(corpo.initPoint, 'sem init_point não há para onde redirecionar').toMatch(/^https:\/\//);

    const linha = await prisma.subscription.findFirst({ where: { decorator_id: A.id } });
    expect(linha).toBeTruthy();
    criadas.push(linha!.mp_preapproval_id);

    // Nasce PENDENTE e NÃO vigente: quem confirma é o Mercado Pago, não nós.
    expect(linha!.status).toBe('pendente');
    expect(linha!.vigente, 'nada de acesso antes da autorização').toBe(false);
    expect(linha!.valor_centavos).toBe(14990);
    expect(linha!.plano).toBe('mensal');
  });

  it('exige sessão: sem cookie devolve 401', async () => {
    expect((await post('/api/billing/subscribe', null, {})).status).toBe(401);
  });
});

describe.skipIf(SEM_MP)('POST /api/billing/sync', () => {
  it('não libera acesso enquanto o MP não autorizar', async () => {
    const preapprovalId = criadas[0];
    const res = await post('/api/billing/sync', A.cookie, { preapproval_id: preapprovalId });
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.pronto, 'preapproval pendente não concede acesso').toBe(false);
    expect(corpo.status).toBe('pendente');
  });

  it('é idempotente: sincronizar de novo não duplica nem muda nada', async () => {
    const preapprovalId = criadas[0];
    const antes = await prisma.subscription.findUnique({ where: { mp_preapproval_id: preapprovalId } });
    await post('/api/billing/sync', A.cookie, { preapproval_id: preapprovalId });
    await post('/api/billing/sync', A.cookie, { preapproval_id: preapprovalId });
    const depois = await prisma.subscription.findUnique({ where: { mp_preapproval_id: preapprovalId } });

    expect(await prisma.subscription.count({ where: { decorator_id: A.id } })).toBe(
      await prisma.subscription.count({ where: { decorator_id: A.id } }),
    );
    expect(depois!.status).toBe(antes!.status);
    expect(depois!.vigente).toBe(antes!.vigente);
  });

  it('B NÃO sincroniza a assinatura de A, mesmo sabendo o id', async () => {
    const res = await post('/api/billing/sync', B.cookie, { preapproval_id: criadas[0] });
    expect(res.status, 'assinatura alheia não é acessível').toBe(404);
  });

  it('preapproval_id ausente é 400, não 500', async () => {
    expect((await post('/api/billing/sync', A.cookie, {})).status).toBe(400);
  });
});

describe.skipIf(SEM_MP)('GET /api/billing/estado', () => {
  it('descreve a assinatura da própria decoradora', async () => {
    const res = await api('/api/billing/estado', A.cookie);
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.liberado, 'ainda não autorizada no MP').toBe(false);
    expect(corpo.valor_centavos).toBe(14990);
  });

  it('quem nunca assinou recebe a oferta de teste grátis', async () => {
    const res = await api('/api/billing/estado', B.cookie);
    const corpo = await res.json();
    expect(corpo.status).toBe('sem_assinatura');
    expect(corpo.ofereceTeste, 'CNPJ novo, teste disponível').toBe(true);
  });
});
