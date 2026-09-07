import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { cancelarAssinatura, estadoDoCancelamento } from '@/lib/assinatura';

// Cancelamento e a oferta de permanência (Termos 6.1).
//
// Camada 1 (autenticada), não 3: quem está inadimplente ou já cancelou precisa
// conseguir abrir esta tela. Exigir assinatura vigente para CANCELAR seria um
// beco — e recusar o acesso de quem quer sair é o pior lugar para pôr atrito.

export async function GET() {
  const acesso = await requireDecorator();
  if (!acesso.ok) return acesso.response;

  const estado = await estadoDoCancelamento(acesso.decoratorId);
  return NextResponse.json(estado);
}

export async function POST(request: Request) {
  const acesso = await requireDecorator();
  if (!acesso.ok) return acesso.response;

  const corpo = await request.json().catch(() => ({}));
  const motivo = typeof corpo.motivo === 'string' ? corpo.motivo : undefined;

  const r = await cancelarAssinatura(acesso.decoratorId, motivo);
  if (!r.ok) {
    if (r.motivo === 'sem_assinatura') {
      return NextResponse.json({ error: 'Não há assinatura para cancelar.' }, { status: 409 });
    }
    if (r.motivo === 'cortesia') {
      // 409, e não 502: nada falhou. O pedido é que não se aplica a esta conta.
      return NextResponse.json({
        error: 'Sua conta está em cortesia — não há cobrança a cancelar.',
        code: 'CORTESIA',
      }, { status: 409 });
    }
    console.error(`[assinatura] cancelamento falhou para ${acesso.decoratorId}: ${r.detalhe}`);
    return NextResponse.json({ error: 'Não foi possível cancelar agora. Tente novamente.' }, { status: 502 });
  }
  // periodo_fim é o que a tela usa para dizer até quando o acesso vale.
  return NextResponse.json({ ok: true, periodoFim: r.periodoFim });
}
