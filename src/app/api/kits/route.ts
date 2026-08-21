import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';
import { hasPrice } from '@/lib/utils';

export async function GET(request: Request) {
  try {
    const sessionId = await getSessionDecoratorId();
    if (!sessionId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Com ?decoratorId= => MEUS kits (valor ignorado, uso a sessão).
    // Sem param => feed do Marketplace: só kits PÚBLICOS de OUTRAS contas.
    const wantsOwn = new URL(request.url).searchParams.has('decoratorId');
    const kits = await prisma.kit.findMany({
      where: wantsOwn
        ? { decorator_id: sessionId }
        : { status: 'Público', decorator_id: { not: sessionId } },
      orderBy: { created_at: 'desc' },
    });
    return NextResponse.json(kits);
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
      return NextResponse.json({ error: 'Kit ID is required' }, { status: 400 });
    }

    // Regra: o valor do kit é OBRIGATÓRIO (> R$ 0,00), na criação e na edição.
    // Backstop de servidor — não confiar apenas no disabled do front.
    if (!hasPrice(data.value)) {
      return NextResponse.json(
        { error: 'O valor do kit é obrigatório e deve ser maior que R$ 0,00.' },
        { status: 400 },
      );
    }

    // Autorização: não deixa editar kit de outra conta.
    const existing = await prisma.kit.findUnique({ where: { id } });
    if (existing && existing.decorator_id !== sessionId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // O dono é SEMPRE a sessão (decorator_id do corpo é ignorado).
    const updated = await prisma.kit.upsert({
      where: { id },
      update: { ...data, decorator_id: sessionId },
      create: { id, ...data, decorator_id: sessionId },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
