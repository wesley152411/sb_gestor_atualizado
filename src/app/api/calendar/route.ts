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

    const rentalOrders = rentalOrdersRaw.map((order) => {
      const {
        rental_order_items,
        decorators_rental_orders_owner_idTodecorators,
        decorators_rental_orders_renter_idTodecorators,
        ...rest
      } = order;
      return {
        ...rest,
        items: rental_order_items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price ? Number(i.price) : 0,
          item_id: i.item_id ?? undefined,
          kit_id: i.kit_id ?? undefined,
        })),
        owner: decorators_rental_orders_owner_idTodecorators ?? undefined,
        renter: decorators_rental_orders_renter_idTodecorators ?? undefined,
      };
    });

    return NextResponse.json({ rentalOrders, partyEvents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
