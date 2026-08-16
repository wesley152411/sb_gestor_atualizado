import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    // Identidade SEMPRE da sessão do servidor.
    const sessionId = await getSessionDecoratorId();
    if (!sessionId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Com ?decoratorId= => MEU acervo (o valor do param é ignorado, uso a sessão).
    // Sem param => feed do Marketplace: só itens PÚBLICOS de OUTRAS contas.
    const wantsOwn = new URL(request.url).searchParams.has('decoratorId');
    const items = await prisma.inventoryItem.findMany({
      where: wantsOwn
        ? { decorator_id: sessionId }
        : { status: 'Público', decorator_id: { not: sessionId } },
      orderBy: { created_at: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionId = await getSessionDecoratorId();
    if (!sessionId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    // Autorização: não deixa editar item de outra conta.
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (existing && existing.decorator_id !== sessionId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // O dono é SEMPRE a sessão (decorator_id do corpo é ignorado).
    const updated = await prisma.inventoryItem.upsert({
      where: { id },
      update: { ...data, decorator_id: sessionId },
      create: { id, ...data, decorator_id: sessionId },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
