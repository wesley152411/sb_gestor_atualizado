import { prisma } from '@/lib/prisma';
import { toDbDate } from '@/lib/utils';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const decoratorId = searchParams.get('decoratorId');

    const events = await prisma.partyEvent.findMany({
      where: decoratorId ? { decorator_id: decoratorId } : undefined,
      orderBy: { event_date: 'asc' },
    });
    return NextResponse.json(events);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    if ('event_date' in data) {
      data.event_date = toDbDate(data.event_date);
    }

    const updated = await prisma.partyEvent.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
