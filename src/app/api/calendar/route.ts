import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    // Identidade SEMPRE da sessão do servidor — ignora qualquer ?decoratorId= do cliente.
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;
    const decoratorId = acesso.decoratorId;
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year'));
    const month = Number(searchParams.get('month')); // 1-12

    if (!year || !month) {
      return NextResponse.json({ error: 'year and month are required' }, { status: 400 });
    }

    const rangeStart = new Date(Date.UTC(year, month - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, month, 1));

    const [rentalOrdersRaw, partyEvents] = await Promise.all([
      prisma.rentalOrder.findMany({
        where: {
          AND: [
            { OR: [{ owner_id: decoratorId }, { renter_id: decoratorId }] },
            { status: { in: ['ativo', 'devolvido'] } }, // canceladas não aparecem
            // A locação aparece no mês se a RETIRADA ou a DEVOLUÇÃO cai nele
            // (cada uma vira um compromisso próprio no calendário).
            { OR: [
              { pickup_date: { gte: rangeStart, lt: rangeEnd } },
              { return_date: { gte: rangeStart, lt: rangeEnd } },
            ] },
          ],
        },
        include: {
          rental_order_items: true,
          decorators_rental_orders_owner_idTodecorators: { select: { name: true } },
          decorators_rental_orders_renter_idTodecorators: { select: { name: true } },
        },
        orderBy: { pickup_date: 'asc' },
      }),
      prisma.partyEvent.findMany({
        where: {
          decorator_id: decoratorId,
          event_date: { gte: rangeStart, lt: rangeEnd },
        },
        orderBy: { event_date: 'asc' },
      }),
    ]);

    // REGRA DO MARKETPLACE (Item 4): a locação entre parceiras pode mostrar aos
    // DOIS lados a data, a peça/kit, a quantidade e o VALOR B2B da locação.
    // Nunca expõe dados do cliente final (nome/telefone/valor cobrado/tema/
    // endereço/observações) — e esses nem estão na RentalOrder (ficam no evento,
    // filtrado por decorator_id). Devolvemos só os campos permitidos, sem
    // nome/telefone da contraparte.
    const rentalOrders = rentalOrdersRaw.map((order) => ({
      id: order.id,
      event_date: order.event_date,
      pickup_date: order.pickup_date,
      return_date: order.return_date,
      returned_at: order.returned_at,
      status: order.status,
      owner_id: order.owner_id,
      renter_id: order.renter_id,
      // Nome da decoradora CONTRAPARTE (parceira de negócio) — permitido: sem isso
      // "Devolver Fazendinha rosa" não diz para quem. Dado de CLIENTE FINAL nunca aparece.
      owner_name: order.decorators_rental_orders_owner_idTodecorators?.name || '',
      renter_name: order.decorators_rental_orders_renter_idTodecorators?.name || '',
      total_value: order.total_value != null ? Number(order.total_value) : 0, // valor B2B (permitido)
      items: order.rental_order_items.map((i) => ({ name: i.name, quantity: i.quantity })),
    }));

    return NextResponse.json({ rentalOrders, partyEvents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
