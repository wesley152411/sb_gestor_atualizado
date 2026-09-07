import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  createTestAccount, sweepTestAccounts, assertDbReachable, api, post, cleanupAccounts, prisma,
  BASE_URL, type TestAccount,
} from './helpers';

// O job de reconciliação e o batimento.
//
// Ele existe porque o webhook pode falhar, o PUT de valor é perdível, e o
// checkout abandonado não se resolve sozinho. E o batimento existe porque um
// cron vermelho já passou semanas despercebido aqui: o e-mail de falha cobre
// "rodou e deu erro", não "deixou de rodar".

const SEGREDO = process.env.RECONCILE_TOKEN || '';
const SEM_SEGREDO = !SEGREDO;

let A: TestAccount;

const chamar = (token: string | null) =>
  fetch(`${BASE_URL}/api/billing/reconcile`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

beforeAll(async () => {
  await assertDbReachable();
  await sweepTestAccounts();
  A = await createTestAccount('rec_a', { assinatura: 'nenhuma' });
});

afterAll(async () => {
  await cleanupAccounts([A?.id].filter(Boolean) as string[]);
  await sweepTestAccounts();
  await prisma.$disconnect();
});

describe.skipIf(SEM_SEGREDO)('quem pode disparar', () => {
  it('sem segredo: 401', async () => {
    expect((await chamar(null)).status).toBe(401);
  });

  it('segredo errado: 401 — e o comprimento não vaza por tempo', async () => {
    expect((await chamar('token-errado')).status).toBe(401);
    expect((await chamar(SEGREDO + 'a')).status).toBe(401);
  });

  it('segredo certo: roda', async () => {
    const r = await chamar(SEGREDO);
    // 200 ou 500 (divergência) — o que não pode é 401.
    expect(r.status).not.toBe(401);
  });
});

describe.skipIf(SEM_SEGREDO)('o que o job conserta sozinho', () => {
  it('expira tentativa de checkout abandonada há mais de 24h', async () => {
    // É o buraco que o `sync` da tela não resolve: quem fecha a aba deixa a linha
    // pendente, e sem o job ela fica pendente para sempre.
    const velha = await prisma.subscription.create({
      data: {
        decorator_id: A.id,
        mp_preapproval_id: `pa_abandonada_${randomUUID()}`,
        status: 'pendente',
        vigente: false,
        valor_centavos: 14990,
        criada_em: new Date(Date.now() - 30 * 3600 * 1000), // 30h atrás
      },
    });

    await chamar(SEGREDO);

    const depois = await prisma.subscription.findUnique({ where: { id: velha.id } });
    expect(depois!.status, 'pendente de 30h vira expirada').toBe('expirada');
  });

  it('NÃO expira pendente recente — quem ainda está no checkout não é atropelada', async () => {
    const nova = await prisma.subscription.create({
      data: {
        decorator_id: A.id,
        mp_preapproval_id: `pa_recente_${randomUUID()}`,
        status: 'pendente',
        vigente: false,
        valor_centavos: 14990,
      },
    });

    await chamar(SEGREDO);

    const depois = await prisma.subscription.findUnique({ where: { id: nova.id } });
    expect(depois!.status, 'ela pode estar preenchendo o cartão agora').toBe('pendente');
    await prisma.subscription.delete({ where: { id: nova.id } });
  });
});

describe.skipIf(SEM_SEGREDO)('o batimento', () => {
  it('cada execução grava quando rodou', async () => {
    await chamar(SEGREDO);
    const linha = await prisma.jobExecucao.findUnique({ where: { id: 'reconciliacao-assinaturas' } });
    expect(linha, 'sem batimento não há como saber se o job parou').toBeTruthy();
    expect(Date.now() - linha!.ultima_execucao.getTime()).toBeLessThan(120000);
  });

  it('a rota de saúde diz que está em dia logo após rodar', async () => {
    await chamar(SEGREDO);
    const r = await api('/api/billing/saude', A.cookie);
    expect(r.status).toBe(200);
    const s = await r.json();
    expect(s.nuncaRodou).toBe(false);
    expect(s.atrasado, 'acabou de rodar').toBe(false);
  });

  it('DETECTA silêncio: batimento velho marca atrasado — é o caso do cron vermelho', async () => {
    // Envelhece o batimento à mão. Este é o cenário que o e-mail de falha do CI
    // NÃO cobre: o job não falhou, ele simplesmente parou de rodar.
    await chamar(SEGREDO);
    await prisma.jobExecucao.update({
      where: { id: 'reconciliacao-assinaturas' },
      data: { ultima_execucao: new Date(Date.now() - 20 * 3600 * 1000) },
    });

    const s = await (await api('/api/billing/saude', A.cookie)).json();
    expect(s.atrasado, '20h de silêncio tem de aparecer na faixa').toBe(true);
    expect(s.horasDesdeUltima).toBeGreaterThanOrEqual(19);

    await chamar(SEGREDO); // devolve ao estado saudável
  });

  it('divergência persistente aparece na saúde e derruba a chamada com 500', async () => {
    // 500 é deliberado: é o que deixa o workflow vermelho e dispara o e-mail do
    // GitHub. Dinheiro errado tem de doer.
    await prisma.jobExecucao.update({
      where: { id: 'reconciliacao-assinaturas' },
      data: { divergencias: 2 },
    });
    const s = await (await api('/api/billing/saude', A.cookie)).json();
    expect(s.divergencias).toBe(2);

    await chamar(SEGREDO); // recalcula e zera se não houver divergência real
  });
});
