import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  createTestAccount, sweepTestAccounts, assertDbReachable, api, post, cleanupAccounts, prisma,
  type TestAccount,
} from './helpers';

// O gate por camadas, exercitado pelo COMPORTAMENTO e não pela leitura do código.
// Os estados de assinatura são montados direto no banco: não dependem do Mercado
// Pago, então estas provas rodam a cada `npm test`.
//
// A pergunta que elas respondem é de negócio, não técnica: o que uma decoradora
// com assinatura vencida ainda consegue fazer, e o que acontece com a cliente
// final dela.

let SEM: TestAccount;   // nunca assinou
let ATIVA: TestAccount;
let SUSPENSA: TestAccount;
let EXPIRADA: TestAccount;
let CANCELADA: TestAccount; // cancelada, mas dentro do período pago

const EM_20_DIAS = () => new Date(Date.now() + 20 * 24 * 3600 * 1000);
const HA_5_DIAS = () => new Date(Date.now() - 5 * 24 * 3600 * 1000);

async function darAssinatura(conta: TestAccount, status: string, periodo_fim: Date | null) {
  await prisma.subscription.create({
    data: {
      decorator_id: conta.id,
      mp_preapproval_id: `pa_gate_${randomUUID()}`,
      status,
      vigente: true,
      valor_centavos: 14990,
      periodo_fim,
    },
  });
}

/** Cria um orçamento com link público, como a decoradora faria. */
async function criarLinkDeOrcamento(conta: TestAccount) {
  const token = randomUUID();
  await prisma.partyEvent.create({
    data: {
      id: `evt_gate_${randomUUID()}`,
      decorator_id: conta.id,
      client_name: 'Cliente da decoradora',
      status: 'Aguardando preenchimento',
      public_token: token,
    },
  });
  return token;
}

beforeAll(async () => {
  await assertDbReachable();
  await sweepTestAccounts();
  [SEM, ATIVA, SUSPENSA, EXPIRADA, CANCELADA] = await Promise.all([
    createTestAccount('gate_sem', { assinatura: 'nenhuma' }),
    createTestAccount('gate_ativa', { assinatura: 'nenhuma' }),
    createTestAccount('gate_susp', { assinatura: 'nenhuma' }),
    createTestAccount('gate_exp', { assinatura: 'nenhuma' }),
    createTestAccount('gate_canc', { assinatura: 'nenhuma' }),
  ]);
  await darAssinatura(ATIVA, 'ativa', EM_20_DIAS());
  await darAssinatura(SUSPENSA, 'suspensa', HA_5_DIAS());
  await darAssinatura(EXPIRADA, 'expirada', HA_5_DIAS());
  await darAssinatura(CANCELADA, 'cancelada', EM_20_DIAS()); // cancelou, período em pé
});

afterAll(async () => {
  await cleanupAccounts([SEM?.id, ATIVA?.id, SUSPENSA?.id, EXPIRADA?.id, CANCELADA?.id].filter(Boolean) as string[]);
  await sweepTestAccounts();
  await prisma.$disconnect();
});

describe('quem nunca assinou', () => {
  it('não lê nem opera, e o código manda para a tela de assinatura', async () => {
    const leitura = await api('/api/clients', SEM.cookie);
    expect(leitura.status).toBe(402);
    expect((await leitura.json()).code).toBe('SUBSCRIPTION_REQUIRED');

    const escrita = await post('/api/clients', SEM.cookie, { id: `c_${Date.now()}`, name: 'x', phone: '11999990000' });
    expect(escrita.status).toBe(402);
    expect((await escrita.json()).code).toBe('SUBSCRIPTION_REQUIRED');
  });
});

describe('assinatura ativa', () => {
  it('lê e opera', async () => {
    expect((await api('/api/clients', ATIVA.cookie)).status).toBe(200);
    expect((await post('/api/clients', ATIVA.cookie, { id: `c_${Date.now()}`, name: 'Cliente', phone: '11999990000' })).status).toBe(200);
  });
});

describe('cancelada dentro do período pago (Termos 6.2)', () => {
  it('continua operando até o fim do período — cancelar não corta na hora', async () => {
    expect((await api('/api/clients', CANCELADA.cookie)).status).toBe(200);
    const r = await post('/api/clients', CANCELADA.cookie, { id: `c_${Date.now()}`, name: 'Ainda opera', phone: '11999990000' });
    expect(r.status, 'ela pagou este mês; o acesso vale até o fim dele').toBe(200);
  });
});

describe('suspensa e expirada — a guarda de 90 dias (Termos 6.3)', () => {
  for (const [rotulo, obter] of [
    ['suspensa', () => SUSPENSA],
    ['expirada', () => EXPIRADA],
  ] as const) {
    it(`${rotulo}: LÊ os próprios dados`, async () => {
      const conta = obter();
      for (const rota of ['/api/clients', '/api/party-events', '/api/inventory', '/api/kits', '/api/orders']) {
        const r = await api(rota, conta.cookie);
        expect(r.status, `${rotulo} deveria conseguir ler ${rota}`).toBe(200);
      }
    });

    it(`${rotulo}: NÃO opera, e a mensagem diz que é somente leitura`, async () => {
      const conta = obter();
      const r = await post('/api/clients', conta.cookie, { id: `c_${Date.now()}`, name: 'nao deveria', phone: '11999990000' });
      expect(r.status).toBe(402);
      const corpo = await r.json();
      // Código próprio: dizer "assine" a quem está dentro dos 90 dias de guarda
      // seria enganoso — ela já assinou, e o que falta é regularizar.
      expect(corpo.code).toBe('SUBSCRIPTION_READ_ONLY');
    });

    it(`${rotulo}: não cria link de orçamento novo`, async () => {
      const conta = obter();
      const r = await post('/api/quote-links', conta.cookie, { partyEventId: 'qualquer' });
      expect(r.status, 'criar link novo é assumir compromisso: exige assinatura').toBe(402);
    });
  }

  it('a leitura é MESMO leitura: nada é gravado na tentativa recusada', async () => {
    const antes = await prisma.client.count({ where: { decorator_id: SUSPENSA.id } });
    await post('/api/clients', SUSPENSA.cookie, { id: `c_${Date.now()}`, name: 'fantasma', phone: '11999990000' });
    expect(await prisma.client.count({ where: { decorator_id: SUSPENSA.id } })).toBe(antes);
  });
});

describe('a cliente final da decoradora', () => {
  it('link de orçamento JÁ ENVIADO continua funcionando com a decoradora suspensa', async () => {
    // A decisão: a cliente final não deve nada. Quebrar um link já enviado não
    // pressiona a decoradora a pagar — estraga a relação dela com a cliente dela.
    const token = await criarLinkDeOrcamento(SUSPENSA);
    const r = await api(`/api/public/quote/${token}`, null); // sem sessão, como a cliente
    expect(r.status, 'a cliente não pode ser punida pelo atraso da decoradora').toBe(200);
  });

  it('vale também para decoradora EXPIRADA', async () => {
    const token = await criarLinkDeOrcamento(EXPIRADA);
    expect((await api(`/api/public/quote/${token}`, null)).status).toBe(200);
  });

  it('e a cliente consegue ENVIAR os dados, não só abrir', async () => {
    const token = await criarLinkDeOrcamento(SUSPENSA);
    const r = await post(`/api/public/quote/${token}`, null, {
      name: 'Cliente Final', phone: '11988887777', event_date: '2026-12-20',
    });
    expect(r.status, 'abrir sem poder responder deixaria a cliente no meio do caminho').toBeLessThan(300);

    // E o dado chegou mesmo ao acervo da decoradora suspensa: a cliente foi
    // atendida de ponta a ponta, apesar de a assinatura estar vencida.
    const evento = await prisma.partyEvent.findUnique({ where: { public_token: token } });
    expect(evento?.client_name).toBe('Cliente Final');
  });
});
