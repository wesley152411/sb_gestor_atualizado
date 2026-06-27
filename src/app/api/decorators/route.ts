import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const decorators = await prisma.decorator.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(decorators);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, ...data } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'Decorator ID is required' }, { status: 400 });
    }

    const updated = await prisma.decorator.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
