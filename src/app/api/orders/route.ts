import { prisma } from '@/lib/prisma';
import { toDbDate, hasPrice } from '@/lib/utils';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';

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

export async function GET() {
  try {
    // Identidade SEMPRE da sessão — devolve só os pedidos em que você é dono OU locatário.
    const sessionId = await getSessionDecoratorId();
    if (!sessionId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const orders = await prisma.rentalOrder.findMany({
      where: {
        OR: [
          { renter_id: sessionId },
          { owner_id: sessionId },
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
    const sessionId = await getSessionDecoratorId();
    if (!sessionId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const { items, ...orderData } = data as any;

    // Autorização: em pedido NOVO, o locatário é a sessão. Em pedido existente,
    // só um participante (dono ou locatário) pode alterar.
    const existing = await prisma.rentalOrder.findUnique({ where: { id } });
    if (existing) {
      if (existing.owner_id !== sessionId && existing.renter_id !== sessionId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
    } else {
      orderData.renter_id = sessionId;
    }
    const orderItems = items as
      | { name: string; quantity: number; price: number; item_id?: string; kit_id?: string }[]
      | undefined;

    // Regra: peça sem valor de locação (> R$ 0,00) NÃO pode entrar em pedido.
    // Confere pelo PREÇO REAL da peça no acervo (não pelo price do corpo, que
    // poderia ser forjado numa chamada direta). Backstop de servidor.
    const pieceIds = (orderItems ?? []).filter((i) => i.item_id).map((i) => i.item_id!);
    if (pieceIds.length > 0) {
      const pieces = await prisma.inventoryItem.findMany({
        where: { id: { in: pieceIds } },
        select: { id: true, name: true, rental_price: true },
      });
      const priceById = new Map(pieces.map((p) => [p.id, p.rental_price]));
      for (const oi of orderItems!) {
        if (oi.item_id && !hasPrice(priceById.get(oi.item_id))) {
          return NextResponse.json(
            { error: `A peça "${oi.name}" está sem valor de locação definido e não pode ser adicionada ao pedido.` },
            { status: 400 },
          );
        }
      }
    }

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
