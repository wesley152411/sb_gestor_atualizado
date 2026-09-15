import 'server-only';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { marketplaceOculto } from '@/lib/feature-flags';

// Barreira do Marketplace NAS ROTAS. Esconder o menu não basta: a API continuaria
// respondendo a quem chamasse direto. Com a flag de ocultar ligada, só conta
// interna (is_internal) passa.
//
// Devolve null quando pode seguir, ou a resposta 404 pronta. 404 e não 403: com
// o Marketplace oculto, para quem está de fora ele simplesmente não existe — o
// mesmo padrão da rota de mensagens promocionais com a flag desligada.
//
// Mora fora de feature-flags.ts de propósito: aquele arquivo é importado pelo
// proxy, que roda no Edge e não pode alcançar o Prisma (proxy-sem-nativo.test).
export async function barrarMarketplace(decoratorId: string | null | undefined): Promise<NextResponse | null> {
  if (!marketplaceOculto) return null;
  if (decoratorId) {
    const conta = await prisma.decorator.findUnique({
      where: { id: decoratorId },
      select: { is_internal: true },
    });
    if (conta?.is_internal) return null;
  }
  return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
}
