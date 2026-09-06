import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomUUID } from 'crypto';
import { assertDbReachable, prisma, BASE_URL } from './helpers';

// Webhook do Mercado Pago, exercitado de ponta a ponta contra a ROTA REAL — e sem
// depender do Mercado Pago. Nós temos o segredo, então montamos o manifesto,
// assinamos e mandamos. É o que torna estas garantias verificáveis a cada `npm
// test`, em vez de um ritual manual no painel.
//
// PULA se o segredo não estiver no ambiente (o CI não tem os secrets do MP).
const SEGREDO = process.env.MP_WEBHOOK_SECRET || '';
const SEM_SEGREDO = !SEGREDO;

const criados: string[] = [];

function manifesto(dataId: string, requestId: string, ts: string) {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

/** Manda uma notificação assinada como o MP faria. `segredo` diferente = forjada. */
async function notificar(opts: {
  corpo: Record<string, unknown>;
  dataId: string;
  ts?: string;
  segredo?: string | null;
  header?: string | null;
}) {
  const requestId = randomUUID();
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
  let header: string | null;
  if (opts.header !== undefined) {
    header = opts.header;
  } else {
    const v1 = createHmac('sha256', opts.segredo ?? SEGREDO)
      .update(manifesto(opts.dataId, requestId, ts), 'utf8')
      .digest('hex');
    header = `ts=${ts},v1=${v1}`;
  }
  if (typeof opts.corpo.id === 'string') criados.push(opts.corpo.id);

  return fetch(`${BASE_URL}/api/billing/webhook?data.id=${encodeURIComponent(opts.dataId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
      ...(header ? { 'x-signature': header } : {}),
    },
    body: JSON.stringify(opts.corpo),
  });
}

const eventoDe = (id: string) => prisma.billingEvent.findUnique({ where: { id } });

beforeAll(async () => {
  if (SEM_SEGREDO) return;
  await assertDbReachable();
});

afterAll(async () => {
  if (SEM_SEGREDO) return;
  // Remove só o que este arquivo criou, por id.
  if (criados.length) await prisma.billingEvent.deleteMany({ where: { id: { in: criados } } });
  await prisma.$disconnect();
});

describe.skipIf(SEM_SEGREDO)('autenticidade', () => {
  it('aceita notificação assinada corretamente e a registra', async () => {
    const id = `wh_ok_${randomUUID()}`;
    const res = await notificar({ corpo: { id, type: 'payment', action: 'updated', data: { id: 'pay_1' } }, dataId: 'pay_1' });
    expect(res.status).toBe(200);

    const ev = await eventoDe(id);
    expect(ev, 'a notificação tem de ficar registrada').toBeTruthy();
    expect(ev!.assinatura_ok).toBe(true);
    expect(ev!.recurso_id).toBe('pay_1');
  });

  it('RECUSA assinatura forjada com 401 — e NÃO grava nada', async () => {
    // É o ataque que a rota existe para barrar: quem descobre a URL não pode
    // escrever no nosso banco nem liberar acesso pago.
    const id = `wh_forjado_${randomUUID()}`;
    const res = await notificar({
      corpo: { id, type: 'subscription_preapproval', data: { id: 'pa_falsa' } },
      dataId: 'pa_falsa',
      segredo: 'segredo-do-atacante',
    });
    expect(res.status).toBe(401);
    expect(await eventoDe(id), 'corpo não assinado não pode virar linha no banco').toBeNull();
  });

  it('RECUSA sem o header x-signature', async () => {
    const id = `wh_sem_header_${randomUUID()}`;
    const res = await notificar({ corpo: { id, type: 'payment', data: { id: 'x' } }, dataId: 'x', header: null });
    expect(res.status).toBe(401);
    expect(await eventoDe(id)).toBeNull();
  });

  it('RECUSA replay: assinatura válida, porém velha', async () => {
    const id = `wh_replay_${randomUUID()}`;
    const velho = String(Math.floor(Date.now() / 1000) - 3600);
    const res = await notificar({ corpo: { id, type: 'payment', data: { id: 'y' } }, dataId: 'y', ts: velho });
    expect(res.status).toBe(401);
    expect(await eventoDe(id)).toBeNull();
  });

  it('RECUSA quando o data.id da URL não é o assinado', async () => {
    // Assina para um recurso e aponta para outro: o manifesto não bate.
    const id = `wh_troca_${randomUUID()}`;
    const requestId = randomUUID();
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac('sha256', SEGREDO).update(manifesto('recurso_a', requestId, ts), 'utf8').digest('hex');
    criados.push(id);
    const res = await fetch(`${BASE_URL}/api/billing/webhook?data.id=recurso_b`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${v1}` },
      body: JSON.stringify({ id, type: 'payment', data: { id: 'recurso_b' } }),
    });
    expect(res.status).toBe(401);
    expect(await eventoDe(id)).toBeNull();
  });
});

describe.skipIf(SEM_SEGREDO)('idempotência', () => {
  it('a MESMA notificação duas vezes processa uma só', async () => {
    // O MP reenvia a cada 15 min até receber 200. Sem isto, um mês grátis seria
    // concedido duas vezes, ou uma cobrança contada em dobro.
    const id = `wh_idem_${randomUUID()}`;
    const corpo = { id, type: 'payment', action: 'updated', data: { id: 'pay_idem' } };

    const primeira = await notificar({ corpo, dataId: 'pay_idem' });
    const segunda = await notificar({ corpo, dataId: 'pay_idem' });

    expect(primeira.status).toBe(200);
    expect(segunda.status, 'a retentativa também recebe 200 — é o que faz o MP parar').toBe(200);
    expect((await segunda.json()).repetida, 'a segunda tem de se declarar repetida').toBe(true);

    const quantas = await prisma.billingEvent.count({ where: { id } });
    expect(quantas, 'uma notificação, uma linha').toBe(1);
  });

  it('dez retentativas simultâneas continuam gerando uma linha só', async () => {
    // Idempotência no BANCO, não na memória: dois processos podem receber a mesma
    // retentativa ao mesmo tempo.
    const id = `wh_corrida_${randomUUID()}`;
    const corpo = { id, type: 'payment', action: 'updated', data: { id: 'pay_corrida' } };
    const respostas = await Promise.all(
      Array.from({ length: 10 }, () => notificar({ corpo, dataId: 'pay_corrida' })),
    );
    expect(respostas.every((r) => r.status === 200), 'nenhuma retentativa pode falhar').toBe(true);
    expect(await prisma.billingEvent.count({ where: { id } })).toBe(1);
  });
});

describe.skipIf(SEM_SEGREDO)('robustez', () => {
  it('tópico desconhecido não quebra: registra e responde 200', async () => {
    // O MP acrescenta tópicos sem avisar. Um 500 aqui viraria retentativa eterna.
    const id = `wh_novo_${randomUUID()}`;
    const res = await notificar({ corpo: { id, type: 'algo_que_o_mp_inventou', data: { id: 'z' } }, dataId: 'z' });
    expect(res.status).toBe(200);
    const ev = await eventoDe(id);
    expect(ev!.tipo).toBe('algo_que_o_mp_inventou');
    expect(ev!.processado_em, 'sem reação inventada, mas registrado').not.toBeNull();
  });

  it('assinatura desconhecida fica registrada e NÃO processada, com o erro anotado', async () => {
    // É a recusa deliberada da órfã, vista pelo webhook: nada é criado, e a linha
    // fica com processado_em nulo para o job de reconciliação encontrar.
    const id = `wh_orfa_${randomUUID()}`;
    const res = await notificar({
      corpo: { id, type: 'subscription_preapproval', action: 'updated', data: { id: 'pa_inexistente_000' } },
      dataId: 'pa_inexistente_000',
    });
    expect(res.status, 'o MP não pode ficar reenviando por causa disto').toBe(200);

    const ev = await eventoDe(id);
    expect(ev).toBeTruthy();
    expect(ev!.processado_em, 'não processado: a assinatura é desconhecida').toBeNull();
    expect(ev!.erro, 'o motivo tem de ficar registrado').toBeTruthy();
  });
});
