import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';

// POST /api/orders/[id]/cancel — cancelar a locação. Assimetria imposta AQUI:
//   • LOCADORA (dona): pode cancelar uma locação ativa a qualquer momento.
//   • LOCATÁRIA (quem alugou): só enquanto a retirada é FUTURA (desistiu antes de
//     retirar). Depois da retirada, só a locadora encerra.
// O handler só mexe no STATUS (nada de datas/itens) — a garantia "só o status"
// vive aqui; a RLS é backstop e é row-level, não column-level.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionId = await getSessionDecoratorId();
    if (!sessionId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { id } = await params;
    const order = await prisma.rentalOrder.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: 'Locação não encontrada' }, { status: 404 });
    if (order.status !== 'ativo') {
      return NextResponse.json({ error: 'Esta locação não está ativa.' }, { status: 400 });
    }

    const isOwner = order.owner_id === sessionId;
    const isRenter = order.renter_id === sessionId;
    if (!isOwner && !isRenter) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    if (isRenter && !isOwner) {
      // Retirada precisa ser FUTURA (comparação em meia-noite UTC, como o @db.Date).
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const pickupFuture = order.pickup_date != null && order.pickup_date.getTime() > today.getTime();
      if (!pickupFuture) {
        return NextResponse.json(
          { error: 'A retirada já chegou ou passou — só a dona da peça pode encerrar a locação agora.' },
          { status: 403 },
        );
      }
    }

    const updated = await prisma.rentalOrder.update({ where: { id }, data: { status: 'cancelado' } });
    return NextResponse.json({ id, status: updated.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
