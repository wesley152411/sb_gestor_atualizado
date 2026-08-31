import { prisma } from '@/lib/prisma';
import { toDbDate, hasPrice } from '@/lib/utils';
import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { loadKitComponents, expandToItemDemand, findShortfalls } from '@/lib/rental-availability';

// Backstop de servidor das validações de data do modal (retirada/devolução).
function validateRentalDates(pickup?: string, ret?: string): string | null {
  if (!pickup || !ret) return 'Informe a data de retirada e a de devolução.';
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const pu = new Date(`${pickup.slice(0, 10)}T00:00:00Z`);
  const rt = new Date(`${ret.slice(0, 10)}T00:00:00Z`);
  if (isNaN(pu.getTime()) || isNaN(rt.getTime())) return 'Datas inválidas.';
  if (pu < today) return 'A data de retirada não pode ser no passado.';
  if (rt < pu) return 'A data de devolução não pode ser anterior à retirada.';
  return null;
}

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
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;
    const sessionId = acesso.decoratorId;

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
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;
    const sessionId = acesso.decoratorId;

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const { items, ...orderData } = data as any;

    // Autorização: em pedido NOVO, o locatário é a sessão. Em pedido existente,
    // só um participante (dono ou locatário) pode alterar.
    const existing = await prisma.rentalOrder.findUnique({ where: { id } });
    const isCreate = !existing;
    // Retirada/devolução da criação (string YYYY-MM-DD) — guardadas antes do
    // toDbDate para a checagem de disponibilidade.
    let pickupStr = '', returnStr = '';
    if (existing) {
      if (existing.owner_id !== sessionId && existing.renter_id !== sessionId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
    } else {
      // Locação NOVA: locatária = sessão, nasce ATIVA, com datas obrigatórias.
      orderData.renter_id = sessionId;
      orderData.status = 'ativo';
      pickupStr = String(orderData.pickup_date || '').slice(0, 10);
      returnStr = String(orderData.return_date || '').slice(0, 10);
      const dateErr = validateRentalDates(pickupStr, returnStr);
      if (dateErr) return NextResponse.json({ error: dateErr }, { status: 400 });
      orderData.pickup_date = toDbDate(pickupStr);
      orderData.return_date = toDbDate(returnStr);
      // event_date (legado) = retirada, como STRING — o bloco toDbDate abaixo a
      // converte. Setar o Date aqui quebraria (toDbDate faz .includes numa string).
      if (!orderData.event_date) orderData.event_date = pickupStr;
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
      // Locação NOVA: o SERVIDOR é a autoridade. Trava as linhas das peças
      // (FOR UPDATE) para serializar locações concorrentes da MESMA peça, então
      // recalcula o disponível no período e recusa se faltar. Sem isso, duas
      // locatárias pedindo ao mesmo tempo estourariam o estoque.
      if (isCreate && orderItems && orderItems.length > 0) {
        const kitIds = [...new Set(orderItems.filter((i) => i.kit_id).map((i) => i.kit_id!))];
        const kitComps = await loadKitComponents(tx, kitIds);
        const itemIds = [...expandToItemDemand(orderItems, kitComps).keys()];
        if (itemIds.length > 0) {
          await tx.$queryRawUnsafe(`SELECT id FROM public.inventory_items WHERE id = ANY($1::text[]) FOR UPDATE`, itemIds);
        }
        const shortfalls = await findShortfalls(tx, orderItems, pickupStr, returnStr);
        if (shortfalls.length > 0) {
          const err: any = new Error('rental-conflict');
          err.shortfalls = shortfalls;
          throw err; // rollback — nada é criado
        }
      }

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
    // Conflito de disponibilidade (corrida): mensagem ESPECÍFICA, não genérica —
    // a locatária precisa entender que a peça foi levada enquanto ela preenchia.
    if (error?.shortfalls?.length) {
      const s = error.shortfalls[0];
      const msg = s.available > 0
        ? `A peça "${s.name}" foi alugada por outra decoradora enquanto você preenchia — restam ${s.available} unidade(s) para essas datas.`
        : `A peça "${s.name}" foi alugada por outra decoradora enquanto você preenchia — não sobrou nenhuma unidade para essas datas.`;
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
