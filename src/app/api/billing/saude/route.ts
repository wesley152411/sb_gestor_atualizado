import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { saudeDoJob } from '@/lib/reconciliacao';

// A faixa do dashboard lê daqui. Camada 1: quem está suspensa também precisa ver
// — e, mais importante, o operador precisa ver de qualquer estado de assinatura.
export async function GET() {
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
  return NextResponse.json({ operador: true, ...(await saudeDoJob()) });
}
