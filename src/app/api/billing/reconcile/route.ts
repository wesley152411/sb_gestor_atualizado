import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { reconciliar, registrarExecucao } from '@/lib/reconciliacao';

// Disparada pelo cron do GitHub Actions. SEM sessão: quem chama é uma máquina.
// O que substitui o gate é um segredo compartilhado — mesma lógica do webhook,
// que troca sessão por assinatura HMAC.
//
// Responde 500 quando há divergência persistente. Isso é deliberado: faz o
// workflow ficar VERMELHO, e o e-mail de falha do GitHub Actions vira o alerta
// sem precisar de serviço novo. Divergência é dinheiro errado, então tem de doer.

function segredoConfere(recebido: string | null): boolean {
  const esperado = process.env.RECONCILE_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const cabecalho = request.headers.get('authorization');
  const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : null;
  if (!segredoConfere(token)) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  try {
    const resumo = await reconciliar();
    await registrarExecucao(resumo);

    if (resumo.divergentes.length > 0) {
      // Etiqueta buscável nos logs, e 500 para o CI enxergar.
      console.error(
        `[COBRANCA-DIVERGENTE] ${resumo.divergentes.length} assinatura(s) não convergiram: ` +
        resumo.divergentes.join(', '),
      );
      return NextResponse.json({ ok: false, resumo }, { status: 500 });
    }
    if (resumo.orfas > 0) {
      console.error(`[ASSINATURA-ORFA] ${resumo.orfas} evento(s) sem linha local nesta passada.`);
    }
    return NextResponse.json({ ok: true, resumo });
  } catch (motivo) {
    const detalhe = motivo instanceof Error ? motivo.message : String(motivo);
    await registrarExecucao(
      { pendentesExpiradas: 0, suspensas: 0, cortesiasIgnoradas: 0, eventosProcessados: 0, valoresConvergidos: 0, divergentes: [], orfas: 0, duracaoMs: 0 },
      detalhe,
    ).catch(() => { /* se nem o batimento grava, o log é o que resta */ });
    console.error(`[reconciliacao] falhou: ${detalhe}`);
    return NextResponse.json({ ok: false, error: 'falha na reconciliação' }, { status: 500 });
  }
}
