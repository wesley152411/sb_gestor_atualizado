import 'server-only';

import { prisma } from '@/lib/prisma';
import { mpFetch, resumoParaLog } from '@/lib/mercadopago';
import { aplicarEstadoDaAssinatura, registrarCobrancaAutorizada } from '@/lib/assinatura';
import {
  centavosParaReais,
  COBRANCAS_DA_RETENCAO,
  HORAS_PARA_EXPIRAR_PENDENTE,
  VALOR_MENSAL_CENTAVOS,
  type StatusLocal,
} from '@/lib/assinatura-estado';

// O JOB DE RECONCILIAÇÃO.
//
// É o que torna o webhook uma otimização em vez de uma dependência. Sem ele:
//   - pendente abandonada fica pendente para sempre;
//   - notificação perdida nunca é recuperada;
//   - divergência de valor no MP não é vista por ninguém;
//   - a volta aos R$ 149,90 depois dos 3 meses da oferta nunca acontece —
//     e essa é a mais cara, porque o PUT de valor é PERDÍVEL (medido: 4 de 5
//     rajadas voltaram sozinhas ao valor original). Não existe "disparar e
//     esquecer"; existe convergir.
//
// Tudo aqui é idempotente e relê a verdade no Mercado Pago.

export const NOME_DO_JOB = 'reconciliacao-assinaturas';

// Assinaturas de CORTESIA não existem no Mercado Pago: são linhas semeadas à mão
// para as contas que já usavam o sistema antes de haver cobrança. Consultar o MP
// por elas devolveria 400 a cada hora, poluindo log e gastando chamada.
//
// O job as ignora — mas CONTA e registra, em vez de pular em silêncio: dá para
// saber quantas cortesias ainda existem lendo o log, sem consultar o banco.
export const PREFIXO_CORTESIA = 'cortesia:';
const ehCortesia = (preapprovalId: string) => preapprovalId.startsWith(PREFIXO_CORTESIA);
const LIMITE_DIVERGENCIA = 3;
const MAX_POR_CICLO = 50;

export type ResumoReconciliacao = {
  pendentesExpiradas: number;
  suspensas: number;
  cortesiasIgnoradas: number;
  eventosProcessados: number;
  valoresConvergidos: number;
  divergentes: string[]; // ids de preapproval que não convergiram
  orfas: number;
  duracaoMs: number;
};

export async function reconciliar(): Promise<ResumoReconciliacao> {
  const inicio = Date.now();
  const agora = new Date();
  const resumo: ResumoReconciliacao = {
    pendentesExpiradas: 0, suspensas: 0, cortesiasIgnoradas: 0, eventosProcessados: 0,
    valoresConvergidos: 0, divergentes: [], orfas: 0, duracaoMs: 0,
  };

  // 1) Tentativas de checkout abandonadas. Sem isto, quem fecha a aba deixa a
  //    linha pendente eternamente — e o `sync` da tela nunca resolve sozinho.
  const limite = new Date(agora.getTime() - HORAS_PARA_EXPIRAR_PENDENTE * 3600 * 1000);
  resumo.pendentesExpiradas = (await prisma.subscription.updateMany({
    where: { status: 'pendente', criada_em: { lt: limite } },
    data: { status: 'expirada', atualizada_em: agora },
  })).count;

  // 2) Notificações que chegaram e não foram processadas (webhook estourou o
  //    orçamento de tempo, ou o MP caiu no meio). Reprocessa pela via de sempre.
  const pendentesDeEvento = await prisma.billingEvent.findMany({
    where: { processado_em: null, tipo: { in: ['subscription_preapproval', 'subscription_authorized_payment'] } },
    orderBy: { recebido_em: 'asc' },
    take: MAX_POR_CICLO,
  });
  for (const evento of pendentesDeEvento) {
    if (!evento.recurso_id) continue;
    const r = evento.tipo === 'subscription_authorized_payment'
      ? await registrarCobrancaAutorizada(evento.recurso_id)
      : await aplicarEstadoDaAssinatura(evento.recurso_id);

    if (r.ok) {
      await prisma.billingEvent.update({
        where: { id: evento.id },
        data: { processado_em: new Date(), erro: null },
      });
      resumo.eventosProcessados++;
    } else {
      if (r.motivo === 'nao_conhecemos') resumo.orfas++;
      await prisma.billingEvent.update({
        where: { id: evento.id },
        data: { erro: r.detalhe.slice(0, 500), tentativas: { increment: 1 } },
      });
    }
  }

  // 3) Assinaturas vivas: relê o estado e deixa o vencimento acontecer.
  //    'inadimplente'/'cancelada' com período vencido viram 'suspensa'/'expirada'
  //    pela própria calcularEstado — aqui só forçamos a releitura.
  const vivas = await prisma.subscription.findMany({
    where: { vigente: true, status: { in: ['em_teste', 'ativa', 'inadimplente', 'cancelada'] } },
    take: MAX_POR_CICLO,
  });
  for (const assinatura of vivas) {
    if (ehCortesia(assinatura.mp_preapproval_id)) { resumo.cortesiasIgnoradas++; continue; }
    const antes = assinatura.status as StatusLocal;
    const r = await aplicarEstadoDaAssinatura(assinatura.mp_preapproval_id);
    if (!r.ok) {
      if (r.motivo === 'nao_conhecemos') resumo.orfas++;
      continue;
    }
    if (antes !== 'suspensa' && r.status === 'suspensa') resumo.suspensas++;
  }

  // 4) CONVERGÊNCIA DO VALOR. Aqui mora a razão de o job ser crítico.
  //    O desejado é nosso; o confirmado é do MP. Enquanto diferirem, reaplica UM
  //    PUT por ciclo — nunca uma rajada, porque rajada se perde.
  const divergentes = await prisma.subscription.findMany({
    where: { vigente: true, status: { in: ['em_teste', 'ativa', 'inadimplente'] } },
    take: MAX_POR_CICLO,
  });
  for (const assinatura of divergentes) {
    if (ehCortesia(assinatura.mp_preapproval_id)) continue; // já contada acima
    // Fim da oferta: 3 cobranças no plano de retenção → volta ao valor cheio.
    const fimDaOferta = assinatura.plano === 'retencao' && assinatura.cobrancas_no_plano >= COBRANCAS_DA_RETENCAO;
    const desejado = fimDaOferta ? VALOR_MENSAL_CENTAVOS : assinatura.valor_centavos;

    if (fimDaOferta && assinatura.valor_centavos !== VALOR_MENSAL_CENTAVOS) {
      await prisma.subscription.update({
        where: { id: assinatura.id },
        data: { plano: 'mensal', valor_centavos: VALOR_MENSAL_CENTAVOS, cobrancas_no_plano: 0, atualizada_em: new Date() },
      });
    }

    if (assinatura.valor_centavos_mp === desejado) continue;

    const r = await mpFetch(`/preapproval/${encodeURIComponent(assinatura.mp_preapproval_id)}`, {
      method: 'PUT',
      body: { auto_recurring: { transaction_amount: centavosParaReais(desejado), currency_id: 'BRL' } },
    });
    if (r.status >= 300) {
      console.error(`[reconciliacao] PUT de valor falhou: ${resumoParaLog('/preapproval', r)}`);
    }

    // NÃO marcamos como convergido aqui: o PUT responder 200 não prova que
    // assentou. Quem confirma é a releitura do próximo ciclo.
    const confirmado = await aplicarEstadoDaAssinatura(assinatura.mp_preapproval_id);
    const depois = await prisma.subscription.findUnique({ where: { id: assinatura.id } });
    if (confirmado.ok && depois?.valor_centavos_mp === desejado) {
      resumo.valoresConvergidos++;
    } else if ((depois?.tentativas_sync ?? 0) >= LIMITE_DIVERGENCIA) {
      resumo.divergentes.push(assinatura.mp_preapproval_id);
    }
  }

  if (resumo.cortesiasIgnoradas > 0) {
    // Etiqueta buscável: `grep CORTESIA` nos logs diz quantas ainda existem, sem
    // precisar abrir o banco. Elas devem chegar a zero quando as contas antigas
    // migrarem para assinatura de verdade.
    console.warn(`[CORTESIA] ${resumo.cortesiasIgnoradas} assinatura(s) de cortesia ignorada(s) — não existem no Mercado Pago.`);
  }

  resumo.duracaoMs = Date.now() - inicio;
  return resumo;
}

/** Grava o batimento. É o que responde "o job ainda está rodando?". */
export async function registrarExecucao(resumo: ResumoReconciliacao, erro?: string) {
  const dados = {
    ultima_execucao: new Date(),
    ultimo_resultado: erro ? 'erro' : 'ok',
    detalhe: erro?.slice(0, 500) ?? null,
    divergencias: resumo.divergentes.length,
    processadas: resumo.eventosProcessados + resumo.suspensas + resumo.pendentesExpiradas,
    duracao_ms: resumo.duracaoMs,
  };
  await prisma.jobExecucao.upsert({
    where: { id: NOME_DO_JOB },
    update: dados,
    create: { id: NOME_DO_JOB, ...dados },
  });
}

export type SaudeDoJob = {
  nuncaRodou: boolean;
  ultimaExecucao: Date | null;
  horasDesdeUltima: number | null;
  atrasado: boolean;
  divergencias: number;
  ultimoResultado: string | null;
};

/** Quantas horas de silêncio antes de a faixa aparecer. */
export const HORAS_ATE_ALERTAR = 6;

/**
 * Lido pela faixa do dashboard. O e-mail de falha do CI cobre "rodou e deu erro";
 * isto cobre "deixou de rodar", que é o caso que passou semanas despercebido.
 */
export async function saudeDoJob(): Promise<SaudeDoJob> {
  const linha = await prisma.jobExecucao.findUnique({ where: { id: NOME_DO_JOB } });
  if (!linha) {
    return { nuncaRodou: true, ultimaExecucao: null, horasDesdeUltima: null, atrasado: true, divergencias: 0, ultimoResultado: null };
  }
  const horas = (Date.now() - linha.ultima_execucao.getTime()) / 3600000;
  return {
    nuncaRodou: false,
    ultimaExecucao: linha.ultima_execucao,
    horasDesdeUltima: Math.floor(horas),
    atrasado: horas > HORAS_ATE_ALERTAR,
    divergencias: linha.divergencias,
    ultimoResultado: linha.ultimo_resultado,
  };
}
