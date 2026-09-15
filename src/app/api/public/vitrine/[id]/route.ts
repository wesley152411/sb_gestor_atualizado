import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { vitrinePublica } from '@/lib/feature-flags';
import type { ItemVitrine, Vitrine } from '@/lib/vitrine';

// Rota PÚBLICA da vitrine compartilhável (Minha Página → compartilhar). Sem
// login: devolve só o que a decoradora já publicou E tem valor.
//
//  - status 'Público' e valor > 0: peça ou kit "A definir" NÃO aparece. É a
//    mesma regra que já impede publicar peça sem preço no Marketplace.
//  - Nunca expõe custo interno, estoque, contato nem item privado.
//  - Conta interna (is_internal) não tem vitrine: 404, como a página da parceira.
//  - Flag desligada: 404 — para quem está de fora, a rota não existe.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!vitrinePublica) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  try {
    const { id } = await params;

    const dona = await prisma.decorator.findFirst({
      where: { id, is_internal: false },
      select: { name: true, company_name: true, avatar_url: true, location: true },
    });
    if (!dona) {
      return NextResponse.json({ error: 'Página não encontrada' }, { status: 404 });
    }

    const [pecas, kits] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { decorator_id: id, status: 'Público', rental_price: { gt: 0 } },
        select: { id: true, name: true, description: true, image_url: true, rental_price: true, created_at: true },
      }),
      prisma.kit.findMany({
        where: { decorator_id: id, status: 'Público', value: { gt: 0 } },
        select: { id: true, name: true, description: true, image_url: true, value: true, items: true, created_at: true },
      }),
    ]);

    // Peças e kits numa grade só, do mais recente ao mais antigo — como um perfil.
    const comData: [number, ItemVitrine][] = [
      ...kits.map((k): [number, ItemVitrine] => [k.created_at.getTime(), {
        tipo: 'kit',
        id: k.id,
        nome: k.name,
        descricao: k.description || '',
        imagem: k.image_url || '',
        preco: Number(k.value),
        pecas: ((k.items as { name?: string; quantity?: number }[] | null) || [])
          .filter((p) => p && p.name)
          .map((p) => ({ nome: String(p.name), quantidade: Number(p.quantity) || 1 })),
      }]),
      ...pecas.map((p): [number, ItemVitrine] => [p.created_at.getTime(), {
        tipo: 'peca',
        id: p.id,
        nome: p.name,
        descricao: p.description || '',
        imagem: p.image_url || '',
        preco: Number(p.rental_price),
        pecas: [],
      }]),
    ];
    comData.sort((a, b) => b[0] - a[0]);

    const vitrine: Vitrine = {
      // O nome da EMPRESA quando houver — é quem aparece para a cliente.
      nome: (dona.company_name || '').trim() || dona.name,
      avatar: dona.avatar_url || '',
      local: dona.location || '',
      itens: comData.map(([, item]) => item),
    };
    return NextResponse.json(vitrine);
  } catch (erro) {
    // Rota pública: a causa vai para o log, nunca para a resposta.
    console.error('[vitrine] falha ao montar a vitrine:', erro);
    return NextResponse.json({ error: 'Não foi possível carregar a página.' }, { status: 500 });
  }
}
