import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';
import { promoWhatsappEnabled } from '@/lib/feature-flags';

// Guarda de feature flag NO SERVIDOR: esconder só o botão deixaria o endpoint
// aberto. Com a flag desligada (produção), a rota nem existe.
function flagGuard() {
  return promoWhatsappEnabled ? null : NextResponse.json({ error: 'Recurso indisponível' }, { status: 404 });
}

// Histórico de mensagens promocionais ABERTAS no WhatsApp. Dono SEMPRE pela
// sessão (nunca por parâmetro). Só do próprio acervo.
export async function GET() {
  try {
    const blocked = flagGuard();
    if (blocked) return blocked;
    const decoratorId = await getSessionDecoratorId();
    if (!decoratorId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const rows = await prisma.clientPromoMessage.findMany({
      where: { decorator_id: decoratorId },
      orderBy: { sent_at: 'desc' },
    });
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Registra um envio (1 linha por clique em Enviar). "aberto", não "entregue":
// o sistema só sabe que o link foi montado/aberto.
export async function POST(request: Request) {
  try {
    const blocked = flagGuard();
    if (blocked) return blocked;
    const decoratorId = await getSessionDecoratorId();
    if (!decoratorId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { clientId, phone, message } = await request.json();
    if (!clientId || !phone || !message) {
      return NextResponse.json({ error: 'clientId, phone e message são obrigatórios' }, { status: 400 });
    }

    // Posse: o cliente tem de pertencer à decoradora da sessão.
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.decorator_id !== decoratorId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const row = await prisma.clientPromoMessage.create({
      data: { client_id: clientId, decorator_id: decoratorId, phone, message },
    });
    return NextResponse.json(row);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
