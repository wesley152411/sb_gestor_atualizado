import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';

// POST /api/orders/[id]/return — marcar DEVOLVIDO. SÓ a LOCADORA (dona da peça),
// nunca a locatária. Assimetria imposta AQUI (a RLS é só backstop).
// O estoque "volta" sozinho: a disponibilidade só conta locações status='ativo',
// então virar 'devolvido' já libera a peça no acervo — sem mexer em stock_quantity.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionId = await getSessionDecoratorId();
    if (!sessionId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { id } = await params;
    const order = await prisma.rentalOrder.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: 'Locação não encontrada' }, { status: 404 });

    // Só a dona da peça encerra. A locatária recebe 403 (não tem esse botão em tela).
    if (order.owner_id !== sessionId) {
      return NextResponse.json({ error: 'Só a dona da peça pode marcar a devolução.' }, { status: 403 });
    }
    if (order.status !== 'ativo') {
      return NextResponse.json({ error: 'Esta locação não está ativa.' }, { status: 400 });
    }

    const updated = await prisma.rentalOrder.update({
      where: { id },
      data: { status: 'devolvido', returned_at: new Date() },
    });
    return NextResponse.json({ id, status: updated.status, returned_at: updated.returned_at });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
