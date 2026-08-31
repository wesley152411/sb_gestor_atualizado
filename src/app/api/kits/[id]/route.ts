import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;
    const sessionId = acesso.decoratorId;

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
