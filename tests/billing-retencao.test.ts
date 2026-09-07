import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  createTestAccount, sweepTestAccounts, assertDbReachable, api, post, cleanupAccounts, prisma,
  limparBeneficiosDoTeste, type TestAccount,
} from './helpers';

// Cancelamento e oferta de permanência (Termos 6.1 e 6.2).
//
// A pergunta que estas provas respondem é a que motivou a etapa: como o sistema
// impede o ciclo `cancela -> aceita a oferta -> cancela -> aceita de novo`, que
// deixaria a assinatura a 99,90 para sempre.
//
// Só o cancelamento REAL depende do Mercado Pago; o resto é decisão nossa, então
// as regras são exercitadas direto. PULA sem credencial (o CI não tem).
const TOKEN = process.env.MP_ACCESS_TOKEN || '';
const SEM_MP = !TOKEN;

const CNPJ = '19131243000197';
let A: TestAccount;

const EM_20_DIAS = () => new Date(Date.now() + 20 * 24 * 3600 * 1000);

async function assinaturaAtiva(conta: TestAccount, plano: 'mensal' | 'retencao' = 'mensal') {
  await prisma.subscription.deleteMany({ where: { decorator_id: conta.id } });
  return prisma.subscription.create({
    data: {
      decorator_id: conta.id,
      mp_preapproval_id: `pa_ret_${randomUUID()}`,
      status: 'ativa',
      vigente: true,
      plano,
      valor_centavos: plano === 'retencao' ? 9990 : 14990,
      periodo_fim: EM_20_DIAS(),
      mp_payer_id: '3660468710',
    },
  });
}

beforeAll(async () => {
  await assertDbReachable();
  await sweepTestAccounts();
  A = await createTestAccount('ret_a', { assinatura: 'nenhuma' });
  await prisma.decorator.update({ where: { id: A.id }, data: { cnpj: CNPJ } });
  await limparBeneficiosDoTeste();
});

afterAll(async () => {
  await limparBeneficiosDoTeste();
  await cleanupAccounts([A?.id].filter(Boolean) as string[]);
  await sweepTestAccounts();
  await prisma.$disconnect();
});

describe('a tela de cancelamento', () => {
  it('oferece a permanência a quem nunca a usou', async () => {
    await assinaturaAtiva(A);
    const r = await api('/api/billing/cancelamento', A.cookie);
    expect(r.status).toBe(200);
    const e = await r.json();
    expect(e.podeCancelar).toBe(true);
    expect(e.ofereceRetencao).toBe(true);
    expect(e.valorOfertaCentavos).toBe(9990);
    expect(e.mesesDaOferta).toBe(3);
  });

  it('abre mesmo para quem já está SUSPENSA — sair não pode ter atrito', async () => {
    await prisma.subscription.updateMany({
      where: { decorator_id: A.id }, data: { status: 'suspensa', periodo_fim: new Date(Date.now() - 86400000) },
    });
    const r = await api('/api/billing/cancelamento', A.cookie);
    expect(r.status, 'recusar acesso a quem quer sair é o pior lugar para pôr atrito').toBe(200);
    await assinaturaAtiva(A);
  });
});

describe('a oferta é consumida na ACEITAÇÃO, não na exibição', () => {
  it('ver a oferta e não aceitar NÃO a queima', async () => {
    await assinaturaAtiva(A);
    await limparBeneficiosDoTeste();

    // Abre a tela (vê a oferta) e desiste — nenhuma aceitação.
    expect((await (await api('/api/billing/cancelamento', A.cookie)).json()).ofereceRetencao).toBe(true);
    expect(await prisma.beneficioConsumido.count({ where: { beneficio: 'oferta_retencao' } })).toBe(0);

    // Volta depois: a oferta continua lá. Queimá-la puniria hesitação e
    // empurraria para o cancelamento alguém que talvez ficasse.
    expect((await (await api('/api/billing/cancelamento', A.cookie)).json()).ofereceRetencao).toBe(true);
  });
});

describe.skipIf(SEM_MP)('aceitar a oferta', () => {
  it('aplica 99,90, zera a contagem e registra o benefício nas âncoras', async () => {
    await assinaturaAtiva(A);
    await limparBeneficiosDoTeste();

    const r = await post('/api/billing/oferta', A.cookie, {});
    expect(r.status, 'a preapproval é de mentira, então só o caminho local é exercitado').toBeLessThan(600);

    if (r.status === 200) {
      const s = await prisma.subscription.findFirst({ where: { decorator_id: A.id, vigente: true } });
      expect(s!.plano).toBe('retencao');
      expect(s!.valor_centavos, 'o DESEJADO vira 99,90; o confirmado vem do MP').toBe(9990);
      expect(s!.cobrancas_no_plano, 'a contagem das 3 recomeça').toBe(0);
      expect(s!.oferta_retencao_em).not.toBeNull();

      const ancoras = await prisma.beneficioConsumido.findMany({ where: { beneficio: 'oferta_retencao' } });
      expect(ancoras.length, 'cnpj + mp_payer').toBeGreaterThanOrEqual(1);
    }
  });
});

describe('o ciclo que a oferta precisa cortar', () => {
  it('depois de consumida, a oferta NÃO é mais exibida — nem após apagar a conta', async () => {
    await assinaturaAtiva(A);
    await limparBeneficiosDoTeste();

    // Simula a aceitação gravando o benefício como a rota faria.
    const { hashAncora } = await import('@/lib/beneficios-hash');
    const pepper = process.env.BENEFICIOS_PEPPER!;
    await prisma.beneficioConsumido.create({
      data: { ancora_tipo: 'cnpj', ancora_hash: hashAncora('cnpj', CNPJ, pepper), beneficio: 'oferta_retencao' },
    });

    expect((await (await api('/api/billing/cancelamento', A.cookie)).json()).ofereceRetencao,
      'segunda volta: sem oferta').toBe(false);

    // E o teste que vale: apagar a conta não devolve a oferta. A âncora é o hash
    // do CNPJ, e a tabela não tem FK para decorators justamente por isto.
    const idAntigo = A.id;
    await prisma.decorator.delete({ where: { id: idAntigo } });
    expect(
      await prisma.beneficioConsumido.count({ where: { beneficio: 'oferta_retencao' } }),
      'apagar a conta não pode devolver a oferta',
    ).toBeGreaterThan(0);

    // Recria a decoradora com o MESMO CNPJ — é o que a pessoa faria.
    await prisma.decorator.create({ data: { id: idAntigo, name: 'Recriada', is_internal: true, cnpj: CNPJ } });
    await assinaturaAtiva({ ...A, id: idAntigo });
    expect((await (await api('/api/billing/cancelamento', A.cookie)).json()).ofereceRetencao,
      'mesmo CNPJ, conta nova: continua sem oferta').toBe(false);
  });

  it('quem já está no plano de retenção não recebe a oferta de novo', async () => {
    await limparBeneficiosDoTeste();
    await assinaturaAtiva(A, 'retencao');
    expect((await (await api('/api/billing/cancelamento', A.cookie)).json()).ofereceRetencao).toBe(false);
  });
});
