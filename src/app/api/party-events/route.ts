import { prisma } from '@/lib/prisma';
import { toDbDate, hasPrice } from '@/lib/utils';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';

export async function GET() {
  try {
    // Identidade SEMPRE da sessão do servidor — ignora qualquer ?decoratorId= do cliente.
    const decoratorId = await getSessionDecoratorId();
    if (!decoratorId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const events = await prisma.partyEvent.findMany({
      where: { decorator_id: decoratorId },
      orderBy: { event_date: 'asc' },
    });
    return NextResponse.json(events);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const decoratorId = await getSessionDecoratorId();
    if (!decoratorId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }
    if ('event_date' in data) {
      data.event_date = toDbDate(data.event_date);
    }

    // Regra: peça sem valor de locação (> R$ 0,00) NÃO pode entrar no formulário.
    // Confere pelo PREÇO REAL da peça no acervo (não pelo price do corpo).
    const evItems = Array.isArray(data.items)
      ? (data.items as { id?: string; name?: string }[])
      : [];
    const evPieceIds = evItems.filter((i) => i.id).map((i) => i.id!);
    if (evPieceIds.length > 0) {
      const pieces = await prisma.inventoryItem.findMany({
        where: { id: { in: evPieceIds } },
        select: { id: true, name: true, rental_price: true },
      });
      const priceById = new Map(pieces.map((p) => [p.id, p.rental_price]));
      for (const it of evItems) {
        if (it.id && !hasPrice(priceById.get(it.id))) {
          return NextResponse.json(
            { error: `A peça "${it.name}" está sem valor de locação definido e não pode entrar no formulário.` },
            { status: 400 },
          );
        }
      }
    }

    // Autorização: não deixa editar evento de outra conta.
    const existing = await prisma.partyEvent.findUnique({ where: { id } });
    if (existing && existing.decorator_id !== decoratorId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // O dono é SEMPRE a sessão — o decorator_id do corpo é ignorado (sobrescrito).
    const updated = await prisma.partyEvent.upsert({
      where: { id },
      update: { ...data, decorator_id: decoratorId },
      create: { id, ...data, decorator_id: decoratorId },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
