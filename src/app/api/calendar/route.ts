import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const decoratorId = searchParams.get('decoratorId');
    const year = Number(searchParams.get('year'));
    const month = Number(searchParams.get('month')); // 1-12

    if (!decoratorId || !year || !month) {
      return NextResponse.json({ error: 'decoratorId, year and month are required' }, { status: 400 });
    }

    const rangeStart = new Date(Date.UTC(year, month - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, month, 1));

    const [rentalOrdersRaw, partyEvents] = await Promise.all([
      prisma.rentalOrder.findMany({
        where: {
          OR: [{ owner_id: decoratorId }, { renter_id: decoratorId }],
          event_date: { gte: rangeStart, lt: rangeEnd },
        },
        include: {
          rental_order_items: true,
          decorators_rental_orders_owner_idTodecorators: { select: { id: true, name: true, phone: true } },
          decorators_rental_orders_renter_idTodecorators: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { event_date: 'asc' },
      }),
      prisma.partyEvent.findMany({
        where: {
          decorator_id: decoratorId,
          event_date: { gte: rangeStart, lt: rangeEnd },
        },
        orderBy: { event_date: 'asc' },
      }),
    ]);

    // ISOLAMENTO: o calendário só precisa da INDISPONIBILIDADE da peça.
    // Não devolvemos valor (total/preços) nem nome/telefone da contraparte —
    // apenas data, status, os IDs (para o app saber se você é dono ou locatário)
    // e o nome das peças comprometidas.
    const rentalOrders = rentalOrdersRaw.map((order) => ({
      id: order.id,
      event_date: order.event_date,
      status: order.status,
      owner_id: order.owner_id,
      renter_id: order.renter_id,
      items: order.rental_order_items.map((i) => ({ name: i.name, quantity: i.quantity })),
    }));

    return NextResponse.json({ rentalOrders, partyEvents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
