import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { assertDbReachable, prisma } from './helpers';

// Provas do MODELO de cobrança contra o banco de TESTE. Não sobem servidor: o que
// está em jogo é se o schema Prisma e o DDL descrevem a mesma coisa, e se as
// garantias que o desenho promete são do BANCO — não da boa vontade do código.
//
// A prova mais importante aqui é a última: apagar a conta NÃO pode devolver o
// teste grátis. É a única razão de beneficios_consumidos não ter FK.

const ID_DEC = `dec_teste_billing_${Date.now()}`;
const marcas: string[] = [];

async function novaAssinatura(over: Record<string, unknown> = {}) {
  return prisma.subscription.create({
    data: {
      decorator_id: ID_DEC,
      mp_preapproval_id: `pa_${randomUUID()}`,
      valor_centavos: 14990,
      ...over,
    },
  });
}

beforeAll(async () => {
  await assertDbReachable();
  await prisma.decorator.create({ data: { id: ID_DEC, name: 'Harness Billing', is_internal: true } });
});

afterAll(async () => {
  await prisma.decorator.deleteMany({ where: { id: ID_DEC } });
  if (marcas.length) await prisma.beneficioConsumido.deleteMany({ where: { ancora_hash: { in: marcas } } });
  await prisma.$disconnect();
});

describe('subscriptions', () => {
  it('grava e relê com os defaults do DDL', async () => {
    const s = await novaAssinatura();
    expect(s.status).toBe('pendente');
    expect(s.plano).toBe('mensal');
    expect(s.valor_centavos).toBe(14990);
    // Dinheiro é inteiro: se algum dia virar Decimal, isto quebra aqui e não na fatura.
    expect(Number.isInteger(s.valor_centavos)).toBe(true);
    expect(s.tentativas_sync).toBe(0);
    // Desejado existe, confirmado ainda não: é o estado "mandei e não sei se valeu".
    expect(s.valor_centavos_mp).toBeNull();
    expect(s.sincronizado_em).toBeNull();
    expect(s.criada_em).toBeInstanceOf(Date);
    await prisma.subscription.delete({ where: { id: s.id } });
  });

  it('recusa status fora da lista (CHECK do banco, não do código)', async () => {
    await expect(novaAssinatura({ status: 'inventado' })).rejects.toThrow();
  });

  it('recusa valor zero ou negativo', async () => {
    await expect(novaAssinatura({ valor_centavos: 0 })).rejects.toThrow();
  });

  it('permite VÁRIAS pendentes (tentativas abandonadas no checkout)', async () => {
    const a = await novaAssinatura({ status: 'pendente' });
    const b = await novaAssinatura({ status: 'pendente' });
    expect(a.id).not.toBe(b.id);
    await prisma.subscription.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });

  it('proíbe DUAS linhas vigentes para a mesma decoradora (índice único parcial)', async () => {
    const viva = await novaAssinatura({ status: 'ativa', vigente: true });
    await expect(novaAssinatura({ status: 'ativa', vigente: true })).rejects.toThrow();
    // Linha não-vigente pode nascer ao lado: é a tentativa nova, ainda no checkout.
    const nova = await novaAssinatura({ status: 'pendente' });
    expect(nova.vigente).toBe(false);
    await prisma.subscription.deleteMany({ where: { id: { in: [viva.id, nova.id] } } });
  });

  it('CANCELAR E REATIVAR dentro do período pago não colide nem perde acesso', async () => {
    // Este é o caso que quebrava o desenho anterior: com o índice preso ao status,
    // a antiga em 'cancelada' e a nova virando 'ativa' davam violação de unicidade
    // DEPOIS de a decoradora já ter pago no Mercado Pago.
    const fimDoPeriodo = new Date(Date.now() + 20 * 24 * 3600 * 1000);

    // 1) assinatura ativa, depois cancelada: segue vigente, com o período intacto.
    const antiga = await novaAssinatura({ status: 'ativa', vigente: true, periodo_fim: fimDoPeriodo });
    await prisma.subscription.update({
      where: { id: antiga.id },
      data: { status: 'cancelada', cancelada_em: new Date() },
    });

    // 2) reativa antes do fim: a linha nova nasce não-vigente, sem colidir.
    const nova = await novaAssinatura({ status: 'pendente' });

    // 3) o Mercado Pago confirma: troca de vigente numa TRANSAÇÃO só, com o
    //    periodo_fim herdado — ela não perde os dias que já pagou.
    await prisma.$transaction([
      prisma.subscription.update({ where: { id: antiga.id }, data: { vigente: false } }),
      prisma.subscription.update({
        where: { id: nova.id },
        data: { vigente: true, status: 'ativa', periodo_fim: antiga.periodo_fim },
      }),
    ]);

    const vigentes = await prisma.subscription.findMany({ where: { decorator_id: ID_DEC, vigente: true } });
    expect(vigentes, 'exatamente uma vigente após a troca').toHaveLength(1);
    expect(vigentes[0].id).toBe(nova.id);
    expect(vigentes[0].periodo_fim?.getTime(), 'o período pago tem de ser herdado').toBe(fimDoPeriodo.getTime());

    // A antiga continua no banco, em 'cancelada': linha de cobrança não se apaga.
    const guardada = await prisma.subscription.findUnique({ where: { id: antiga.id } });
    expect(guardada?.status).toBe('cancelada');
    expect(guardada?.vigente).toBe(false);

    await prisma.subscription.deleteMany({ where: { id: { in: [antiga.id, nova.id] } } });
  });

  it('mp_preapproval_id é único: a mesma preapproval nunca vira duas linhas', async () => {
    const s = await novaAssinatura();
    await expect(novaAssinatura({ mp_preapproval_id: s.mp_preapproval_id })).rejects.toThrow();
    await prisma.subscription.delete({ where: { id: s.id } });
  });
});

describe('billing_events', () => {
  it('a mesma notificação não entra duas vezes (é a idempotência do webhook)', async () => {
    const id = `notif_${randomUUID()}`;
    await prisma.billingEvent.create({
      data: { id, tipo: 'subscription_preapproval', payload: { data: { id: 'x' } } },
    });
    await expect(
      prisma.billingEvent.create({ data: { id, tipo: 'subscription_preapproval', payload: {} } }),
    ).rejects.toThrow();

    // É assim que o handler vai fazer: se não inseriu, já processou.
    const repetida = await prisma.billingEvent.createMany({
      data: [{ id, tipo: 'subscription_preapproval', payload: {} }],
      skipDuplicates: true,
    });
    expect(repetida.count, 'ON CONFLICT DO NOTHING deve absorver a retentativa').toBe(0);

    await prisma.billingEvent.delete({ where: { id } });
  });
});

describe('beneficios_consumidos', () => {
  it('o mesmo benefício não é registrado duas vezes para a mesma âncora', async () => {
    const hash = `hash_${randomUUID()}`;
    marcas.push(hash);
    await prisma.beneficioConsumido.create({ data: { ancora_tipo: 'cnpj', ancora_hash: hash, beneficio: 'teste_gratis' } });
    await expect(
      prisma.beneficioConsumido.create({ data: { ancora_tipo: 'cnpj', ancora_hash: hash, beneficio: 'teste_gratis' } }),
    ).rejects.toThrow();
    // Outro benefício, mesma âncora: permitido (teste grátis e oferta são distintos).
    await prisma.beneficioConsumido.create({ data: { ancora_tipo: 'cnpj', ancora_hash: hash, beneficio: 'oferta_retencao' } });
  });

  it('APAGAR A CONTA NÃO DEVOLVE O TESTE GRÁTIS — e leva as assinaturas junto', async () => {
    const idTemp = `dec_temp_${randomUUID()}`;
    const hash = `hash_${randomUUID()}`;
    marcas.push(hash);

    await prisma.decorator.create({ data: { id: idTemp, name: 'Some depois', is_internal: true } });
    const assinatura = await prisma.subscription.create({
      data: { decorator_id: idTemp, mp_preapproval_id: `pa_${randomUUID()}`, valor_centavos: 14990, status: 'ativa' },
    });
    await prisma.beneficioConsumido.create({ data: { ancora_tipo: 'cnpj', ancora_hash: hash, beneficio: 'teste_gratis' } });

    await prisma.decorator.delete({ where: { id: idTemp } });

    // A assinatura vai junto (FK com cascata) ...
    expect(await prisma.subscription.findUnique({ where: { id: assinatura.id } })).toBeNull();
    // ... mas o registro do benefício FICA. É a razão de a tabela não ter FK:
    // recriar a conta com outro e-mail não pode render um segundo mês grátis.
    const sobreviveu = await prisma.beneficioConsumido.findFirst({ where: { ancora_hash: hash, beneficio: 'teste_gratis' } });
    expect(sobreviveu, 'o benefício consumido tem de sobreviver à exclusão da conta').toBeTruthy();
  });
});
