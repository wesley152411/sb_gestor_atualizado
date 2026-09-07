import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { aplicarEstadoDaAssinatura, registrarCobrancaAutorizada } from '@/lib/assinatura';
import { chaveDoEvento, tipoDoEvento, validarAssinatura, type CorpoWebhook } from '@/lib/webhook-mp';

// Webhook do Mercado Pago.
//
// SEM sessão de propósito: quem chama é o MP, não um navegador. O que substitui a
// sessão é a assinatura do header `x-signature` — sem ela, qualquer um que
// descubra a URL libera acesso pago mandando um POST. Por isso a validação vem
// ANTES de qualquer escrita, e uma falha não deixa nem registro do corpo.
//
// Três garantias, nesta ordem:
//   1. autenticidade — HMAC do manifesto, em tempo constante, com janela anti-replay;
//   2. idempotência   — a PK de billing_events é o id da notificação; o MP reenvia
//                       a MESMA a cada 15 min até receber 200;
//   3. resposta rápida — o MP desiste em 22s. O trabalho é um GET e um UPDATE;
//                       se estourar, a linha fica com processado_em nulo e o job
//                       de reconciliação termina depois.

const ORCAMENTO_MS = 12000; // folga sobre os 22s do MP, com margem para a rede

export async function POST(request: Request) {
  const agora = new Date();
  const url = new URL(request.url);

  // O `data.id` do manifesto é o da QUERY STRING. O corpo é fallback para os
  // formatos em que o MP não o repete na URL.
  const corpoTexto = await request.text();
  let corpo: CorpoWebhook = {};
  try {
    corpo = corpoTexto ? (JSON.parse(corpoTexto) as CorpoWebhook) : {};
  } catch {
    // Corpo ilegível: ainda assim exigimos assinatura válida antes de reagir.
  }

  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? (corpo.data?.id != null ? String(corpo.data.id) : null);

  const validacao = validarAssinatura({
    header: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId,
    segredo: process.env.MP_WEBHOOK_SECRET,
    agora,
  });

  if (!validacao.valido) {
    // NADA é gravado: aceitar corpo não assinado seria dar a um estranho um canal
    // de escrita no nosso banco. O motivo sai no log (sem o segredo, sem o corpo).
    console.warn(`[webhook-mp] RECUSADO (${validacao.motivo}) data.id=${dataId ?? '-'} tipo=${corpo.type ?? corpo.topic ?? '-'}`);
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });
  }

  const tipo = tipoDoEvento(corpo);
  const chave = chaveDoEvento(corpo);

  // Idempotência no BANCO, não na memória: dois processos podem receber a mesma
  // retentativa ao mesmo tempo. Quem insere processa; quem conflita já foi.
  const inserida = await prisma.billingEvent.createMany({
    data: [{
      id: chave,
      tipo: tipo === 'desconhecido' ? (corpo.type || corpo.topic || 'desconhecido') : tipo,
      acao: corpo.action ?? null,
      recurso_id: dataId,
      payload: JSON.parse(JSON.stringify(corpo)),
      assinatura_ok: true,
      recebido_em: agora,
    }],
    skipDuplicates: true,
  });

  if (inserida.count === 0) {
    // Retentativa do MP. Responder 200 é o que faz ele parar de reenviar.
    return NextResponse.json({ ok: true, repetida: true });
  }

  try {
    const resultado = await Promise.race([
      processar(tipo, dataId),
      new Promise<{ ok: false; detalhe: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, detalhe: 'orçamento de tempo estourado' }), ORCAMENTO_MS),
      ),
    ]);

    if (resultado.ok) {
      await prisma.billingEvent.update({
        where: { id: chave },
        data: { processado_em: new Date(), mp_preapproval_id: resultado.preapprovalId ?? null },
      });
    } else {
      // processado_em segue NULO: é assim que o job de reconciliação sabe o que
      // ainda falta. Responder 200 mesmo assim evita o MP reenviar em loop algo
      // que a retentativa dele não conserta.
      await prisma.billingEvent.update({
        where: { id: chave },
        data: { erro: resultado.detalhe.slice(0, 500), tentativas: { increment: 1 } },
      });
      console.error(`[webhook-mp] recebido mas NÃO processado: ${chave} tipo=${tipo} — ${resultado.detalhe}`);
    }
  } catch (motivo) {
    const detalhe = motivo instanceof Error ? motivo.message : String(motivo);
    await prisma.billingEvent.update({
      where: { id: chave },
      data: { erro: detalhe.slice(0, 500), tentativas: { increment: 1 } },
    }).catch(() => { /* o registro do evento já existe; o job pega depois */ });
    console.error(`[webhook-mp] erro ao processar ${chave}: ${detalhe}`);
  }

  return NextResponse.json({ ok: true });
}

type Processamento = { ok: true; preapprovalId?: string } | { ok: false; detalhe: string };

async function processar(tipo: ReturnType<typeof tipoDoEvento>, dataId: string | null): Promise<Processamento> {
  if (!dataId) return { ok: false, detalhe: 'sem data.id' };

  switch (tipo) {
    case 'subscription_preapproval': {
      // Aqui o data.id JÁ é o da preapproval.
      const r = await aplicarEstadoDaAssinatura(dataId);
      return r.ok ? { ok: true, preapprovalId: dataId } : { ok: false, detalhe: `${r.motivo}: ${r.detalhe}` };
    }

    case 'subscription_authorized_payment': {
      // Aqui o data.id é o da COBRANÇA — resolver para a preapproval é parte do
      // trabalho, e é o que preenche primeira_cobranca_em.
      const r = await registrarCobrancaAutorizada(dataId);
      return r.ok ? { ok: true, preapprovalId: r.preapprovalId } : { ok: false, detalhe: `${r.motivo}: ${r.detalhe}` };
    }

    // Registrados para auditoria, sem reação automática: o estado da assinatura
    // vem sempre da preapproval, e inventar reação a partir daqui duplicaria a
    // verdade em dois lugares.
    case 'payment':
    case 'subscription_preapproval_plan':
    case 'desconhecido':
    default:
      return { ok: true };
  }
}
