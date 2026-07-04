import { prisma } from '@/lib/prisma';
import { toDbDate } from '@/lib/utils';
import { NextResponse } from 'next/server';

const ORDER_INCLUDE = {
  rental_order_items: true,
  decorators_rental_orders_owner_idTodecorators: {
    select: { id: true, name: true, phone: true },
  },
  decorators_rental_orders_renter_idTodecorators: {
    select: { id: true, name: true, phone: true },
  },
} as const;

function serializeOrder(order: any) {
  const {
    rental_order_items,
    decorators_rental_orders_owner_idTodecorators,
    decorators_rental_orders_renter_idTodecorators,
    ...rest
  } = order;
  return {
    ...rest,
    items: rental_order_items?.map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price ? Number(i.price) : 0,
      item_id: i.item_id ?? undefined,
      kit_id: i.kit_id ?? undefined,
    })),
    owner: decorators_rental_orders_owner_idTodecorators ?? undefined,
    renter: decorators_rental_orders_renter_idTodecorators ?? undefined,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const decoratorId = searchParams.get('decoratorId');

    if (!decoratorId) {
      return NextResponse.json({ error: 'Decorator ID is required' }, { status: 400 });
    }

    const orders = await prisma.rentalOrder.findMany({
      where: {
        OR: [
          { renter_id: decoratorId },
          { owner_id: decoratorId },
        ],
      },
      orderBy: { created_at: 'desc' },
      include: ORDER_INCLUDE,
    });
    return NextResponse.json(orders.map(serializeOrder));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const { items, ...orderData } = data as any;
    const orderItems = items as
      | { name: string; quantity: number; price: number; item_id?: string; kit_id?: string }[]
      | undefined;
    if ('event_date' in orderData) {
      orderData.event_date = toDbDate(orderData.event_date);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.rentalOrder.upsert({
        where: { id },
        update: orderData,
        create: { id, ...orderData },
      });

      if (orderItems) {
        await tx.rentalOrderItem.deleteMany({ where: { order_id: id } });
        if (orderItems.length > 0) {
          await tx.rentalOrderItem.createMany({
            data: orderItems.map((i) => ({
              order_id: id,
              item_id: i.item_id,
              kit_id: i.kit_id,
              name: i.name,
              quantity: i.quantity,
              price: i.price,
            })),
          });
        }
      }

      return tx.rentalOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
    });

    return NextResponse.json(serializeOrder(updated));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
