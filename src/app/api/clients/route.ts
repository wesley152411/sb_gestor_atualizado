import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';

export async function GET() {
  try {
    // Identidade SEMPRE da sessão do servidor — ignora qualquer ?decoratorId= do cliente.
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;
    const decoratorId = acesso.decoratorId;
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
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;
    const decoratorId = acesso.decoratorId;

    const body = await request.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    // Autorização: não deixa editar cliente de outra conta.
    const existing = await prisma.client.findUnique({ where: { id } });
    if (existing && existing.decorator_id !== decoratorId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // O dono é SEMPRE a sessão — o decorator_id do corpo é ignorado (sobrescrito).
    const updated = await prisma.client.upsert({
      where: { id },
      update: { ...data, decorator_id: decoratorId },
      create: { id, ...data, decorator_id: decoratorId },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
