import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const decoratorId = searchParams.get('decoratorId');
    const decoratorA = searchParams.get('decoratorA');
    const decoratorB = searchParams.get('decoratorB');

    if (decoratorA && decoratorB) {
      const messages = await prisma.chatMessage.findMany({
        where: {
          OR: [
            { sender_id: decoratorA, receiver_id: decoratorB },
            { sender_id: decoratorB, receiver_id: decoratorA },
          ],
        },
        orderBy: { created_at: 'asc' },
      });
      return NextResponse.json(messages);
    }

    if (decoratorId) {
      const messages = await prisma.chatMessage.findMany({
        where: {
          OR: [
            { sender_id: decoratorId },
            { receiver_id: decoratorId },
          ],
        },
        orderBy: { created_at: 'asc' },
      });
      return NextResponse.json(messages);
    }

    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const updated = await prisma.chatMessage.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
