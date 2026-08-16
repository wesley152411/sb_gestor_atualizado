import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = await getSessionDecoratorId();
    if (!sessionId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Kit ID is required' }, { status: 400 });
    }

    // Autorização: só apaga kit da PRÓPRIA conta.
    const existing = await prisma.kit.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Kit não encontrado' }, { status: 404 });
    }
    if (existing.decorator_id !== sessionId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    await prisma.kit.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
