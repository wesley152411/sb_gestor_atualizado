import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { aceitarOfertaRetencao } from '@/lib/assinatura';

// Aceite da oferta de permanência. O benefício é consumido AQUI, na aceitação —
// nunca na exibição: quem só olhou e desistiu de cancelar não obteve nada.

export async function POST() {
  const acesso = await requireDecorator();
  if (!acesso.ok) return acesso.response;

  const r = await aceitarOfertaRetencao(acesso.decoratorId);
  if (!r.ok) {
    const conhecidos: Record<string, { status: number; mensagem: string }> = {
      sem_assinatura: { status: 409, mensagem: 'Não há assinatura ativa para aplicar a oferta.' },
      ja_usada: { status: 409, mensagem: 'Esta oferta já foi utilizada uma vez.' },
      ja_na_retencao: { status: 409, mensagem: 'Sua assinatura já está com a oferta aplicada.' },
      cortesia: { status: 409, mensagem: 'Sua conta está em cortesia — não há valor a descontar.' },
    };
    const conhecido = conhecidos[r.motivo];
    if (conhecido) return NextResponse.json({ error: conhecido.mensagem, code: r.motivo.toUpperCase() }, { status: conhecido.status });

    console.error(`[assinatura] oferta falhou para ${acesso.decoratorId}: ${r.detalhe}`);
    return NextResponse.json({ error: 'Não foi possível aplicar a oferta agora.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, valorCentavos: r.valorCentavos });
}
