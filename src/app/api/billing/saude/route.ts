import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { saudeDoJob } from '@/lib/reconciliacao';
import { diagnosticoCredencial } from '@/lib/mercadopago';
import { redigirSegredos } from '@/lib/mercadopago-credencial';

// A faixa do dashboard lê daqui. Camada 1: quem está suspensa também precisa ver
// — e, mais importante, o operador precisa ver de qualquer estado de assinatura.
//
// ESTA ROTA NÃO PODE MORRER CALADA. Ela existe para diagnosticar, e a primeira
// versão não tinha try/catch: uma falha no banco virava 500 VAZIO — o Chrome
// mostrava "Esta página não está funcionando" e não sobrava pista nenhuma,
// exatamente na hora em que o operador precisava dela.

/** Última linha útil do erro, redigida. Erro do Prisma começa com quebra de linha. */
function motivoLegivel(erro: unknown): string {
  const texto = redigirSegredos(erro instanceof Error ? erro.message : String(erro));
  return texto.split('\n').map((s) => s.trim()).filter(Boolean).slice(-1)[0] || '(erro sem mensagem)';
}

export async function GET() {
  try {
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;

    // SÓ O OPERADOR. "A reconciliação de cobrança não roda desde 06/09" é estado
    // interno: a decoradora não sabe o que é, não pode agir, e a mensagem sugere
    // que o produto dela está quebrado. Estado de operação vazando para o cliente
    // é pior do que não ter faixa nenhuma.
    //
    // Variável de ambiente basta porque aqui não há privilégio concedido — só uma
    // mensagem exibida. Nenhuma rota de dados depende disto.
    if (process.env.OPERADOR_DECORATOR_ID !== acesso.decoratorId) {
      return NextResponse.json({ operador: false });
    }

    // allSettled, não all: as duas partes são independentes, e uma quebrada não
    // pode esconder a outra. Se o banco falhar, o veredito do Mercado Pago ainda
    // aparece — e vice-versa.
    const [job, mp] = await Promise.allSettled([saudeDoJob(), diagnosticoCredencial()]);

    const relatar = (parte: string, r: PromiseRejectedResult) => {
      const motivo = motivoLegivel(r.reason);
      console.error(`[SAUDE-FALHA] ${parte}: ${motivo}`);
      return motivo;
    };

    // Daqui para baixo quem lê é o OPERADOR (a guarda acima já passou), então o
    // motivo volta no JSON: ele é quem diagnostica, e é para isso que a rota existe.
    return NextResponse.json({
      operador: true,
      ...(job.status === 'fulfilled' ? job.value : { jobErro: relatar('job', job) }),
      mercadoPago: mp.status === 'fulfilled' ? mp.value : { ok: false, erro: relatar('mercadoPago', mp) },
    });
  } catch (motivo) {
    // Falha ANTES de saber se é o operador (ex.: na leitura da sessão). O motivo
    // vai só para o log — sem saber quem pediu, não dá para mostrar detalhe interno.
    console.error(`[SAUDE-FALHA] geral: ${motivoLegivel(motivo)}`);
    return NextResponse.json({ error: 'Não foi possível consultar a saúde agora.' }, { status: 500 });
  }
}
