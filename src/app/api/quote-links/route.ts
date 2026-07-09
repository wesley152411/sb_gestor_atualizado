import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { decoratorId, itemId, kitId } = body;

    if (!decoratorId || (!itemId && !kitId)) {
      return NextResponse.json({ error: 'decoratorId and itemId or kitId are required' }, { status: 400 });
    }

    let name = '';
    let price = 0;
    let sourceItemId: string | undefined;
    let sourceKitId: string | undefined;
    let items: { id: string; name: string; quantity: number; price: number }[] = [];

    if (kitId) {
      const kit = await prisma.kit.findUnique({ where: { id: kitId } });
      if (!kit) return NextResponse.json({ error: 'Kit not found' }, { status: 404 });
      name = kit.name;
      price = kit.value ? Number(kit.value) : 0;
      sourceKitId = kit.id;
      const kitItems = (kit.items as { id: string; name: string; quantity: number }[] | null) || [];
      items = kitItems.map((ki) => ({ id: ki.id, name: ki.name, quantity: ki.quantity, price: 0 }));
    } else {
      const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      name = item.name;
      price = item.rental_price ? Number(item.rental_price) : 0;
      sourceItemId = item.id;
      items = [{ id: item.id, name: item.name, quantity: 1, price }];
    }

    const quote = await prisma.partyEvent.create({
      data: {
        id: `quote-${Date.now()}`,
        decorator_id: decoratorId,
        source_item_id: sourceItemId,
        source_kit_id: sourceKitId,
        public_token: randomUUID(),
        client_name: '',
        theme: name,
        total_value: price,
        status: 'Pendente',
        items,
      },
    });

    return NextResponse.json({ token: quote.public_token });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
