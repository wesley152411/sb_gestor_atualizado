import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // ISOLAMENTO MULTI-CONTA: sem decoratorId NÃO retornamos nada (antes vazava
    // a lista completa de clientes de todas as contas).
    const { searchParams } = new URL(request.url);
    const decoratorId = searchParams.get('decoratorId');
    if (!decoratorId) {
      return NextResponse.json({ error: 'decoratorId is required' }, { status: 400 });
    }
    const clients = await prisma.client.findMany({
      where: { decorator_id: decoratorId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(clients);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const updated = await prisma.client.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
