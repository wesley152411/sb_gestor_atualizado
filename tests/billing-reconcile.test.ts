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

  it('DETECTA silêncio: batimento velho conta como atraso', async () => {
    // É o cenário que o e-mail de falha do CI NÃO cobre: o job não falhou, ele
    // simplesmente parou de rodar. Sem isto, o cron vermelho volta a passar
    // semanas despercebido.
    await chamar(SEGREDO);
    await prisma.jobExecucao.update({
      where: { id: 'reconciliacao-assinaturas' },
      data: { ultima_execucao: new Date(Date.now() - 20 * 3600 * 1000) },
    });

    const linha = await prisma.jobExecucao.findUnique({ where: { id: 'reconciliacao-assinaturas' } });
    const horas = (Date.now() - linha!.ultima_execucao.getTime()) / 3600000;
    expect(horas, '20h de silêncio tem de passar do limite de 6h').toBeGreaterThan(6);

    await chamar(SEGREDO); // devolve ao estado saudável
    const depois = await prisma.jobExecucao.findUnique({ where: { id: 'reconciliacao-assinaturas' } });
    expect((Date.now() - depois!.ultima_execucao.getTime()) / 3600000).toBeLessThan(1);
  });

  it('divergência persistente fica registrada no batimento', async () => {
    await prisma.jobExecucao.update({
      where: { id: 'reconciliacao-assinaturas' },
      data: { divergencias: 2 },
    });
    const linha = await prisma.jobExecucao.findUnique({ where: { id: 'reconciliacao-assinaturas' } });
    expect(linha!.divergencias).toBe(2);
    await chamar(SEGREDO); // recalcula
  });
});

describe('a faixa do batimento é SÓ do operador', () => {
  it('decoradora comum recebe operador:false e nenhum estado interno', async () => {
    // "A reconciliação não roda desde 06/09" é estado de operação. A decoradora
    // não sabe o que é, não pode agir, e a mensagem sugere que o produto dela
    // está quebrado. Vazar isso é pior do que não ter faixa nenhuma.
    const r = await api('/api/billing/saude', A.cookie);
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.operador).toBe(false);
    expect(corpo.ultimaExecucao, 'nada de estado interno no corpo').toBeUndefined();
    expect(corpo.divergencias).toBeUndefined();
    expect(corpo.atrasado).toBeUndefined();
  });
});
