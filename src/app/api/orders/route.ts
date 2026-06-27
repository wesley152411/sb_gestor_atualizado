import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

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
    });
    return NextResponse.json(orders);
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

    // Since items are nested in standard object but might not be in DB schema, 
    // we drop the extra nested items field when storing in rental_orders.
    const { items, ...orderData } = data;

    const updated = await prisma.rentalOrder.upsert({
      where: { id },
      update: orderData,
      create: { id, ...orderData },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
