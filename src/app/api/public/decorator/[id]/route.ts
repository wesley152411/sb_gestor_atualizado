import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// Rota PÚBLICA: perfil de uma decoradora + apenas o acervo com status "Público".
// Não expõe custo interno nem itens privados — segura para a página da parceira.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Conta interna de teste NÃO tem página pública acessível (mesma flag da
    // listagem do Marketplace). findFirst com o filtro => internal vira 404.
    const decorator = await prisma.decorator.findFirst({
      where: { id, is_internal: false },
      select: {
        id: true,
        name: true,
        avatar_url: true,
        logo_url: true,
        cover_url: true,
        location: true,
        instagram: true,
        whatsapp: true,
        about: true,
      },
    });

    if (!decorator) {
      return NextResponse.json({ error: 'Parceira não encontrada' }, { status: 404 });
    }

    const [items, kits] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { decorator_id: id, status: 'Público' },
        select: {
          id: true,
          name: true,
          description: true,
          image_url: true,
          rental_price: true,
          stock_quantity: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.kit.findMany({
        where: { decorator_id: id, status: 'Público' },
        select: {
          id: true,
          name: true,
          description: true,
          image_url: true,
          value: true,
          items: true,
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    return NextResponse.json({ decorator, items, kits });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
