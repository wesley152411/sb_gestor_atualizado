import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAssinaturaAtiva } from '@/lib/api-auth';
import { EVENT_STATUS } from '@/lib/event-status';
import { TIPO_LINK, ehTipoLink, instanteDoCampo, validarPeriodo } from '@/lib/aluguel';

export async function POST(request: Request) {
  try {
    // Dono do link SEMPRE da sessão — não aceitamos decoratorId do corpo.
    const acesso = await requireAssinaturaAtiva();
    if (!acesso.ok) return acesso.response;
    const decoratorId = acesso.decoratorId;

    const body = await request.json();
    const { itemId, kitId } = body;

    // TIPO DO LINK. "decoracao" é o de sempre. No "aluguel" a cliente leva a peça
    // e devolve depois: quem define retirada e devolução é a DECORADORA, aqui, e
    // a cliente só lê (o POST público não escreve estes campos).
    const tipo = body.tipo === undefined || body.tipo === null ? TIPO_LINK.DECORACAO : body.tipo;
    if (!ehTipoLink(tipo)) {
      return NextResponse.json({ error: 'Tipo de link inválido.' }, { status: 400 });
    }
    const ehAluguel = tipo === TIPO_LINK.ALUGUEL;
    const retirada = ehAluguel ? instanteDoCampo(body.retirada) : null;
    const devolucao = ehAluguel ? instanteDoCampo(body.devolucao) : null;
    if (ehAluguel) {
      const problema = validarPeriodo(retirada, devolucao);
      if (problema) return NextResponse.json({ error: problema }, { status: 400 });
    }

    if (!itemId && !kitId) {
      return NextResponse.json({ error: 'itemId or kitId is required' }, { status: 400 });
    }

    let name = '';
    let price = 0;
    let sourceItemId: string | undefined;
    let sourceKitId: string | undefined;
    let items: { id: string; name: string; quantity: number; price: number }[] = [];

    if (kitId) {
      const kit = await prisma.kit.findUnique({ where: { id: kitId } });
      if (!kit) return NextResponse.json({ error: 'Kit not found' }, { status: 404 });
      // Autorização: só dá pra gerar link do PRÓPRIO kit.
      if (kit.decorator_id !== decoratorId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
      name = kit.name;
      price = kit.value ? Number(kit.value) : 0;
      sourceKitId = kit.id;
      const kitItems = (kit.items as { id: string; name: string; quantity: number }[] | null) || [];
      items = kitItems.map((ki) => ({ id: ki.id, name: ki.name, quantity: ki.quantity, price: 0 }));
    } else {
      const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      // Autorização: só dá pra gerar link da PRÓPRIA peça.
      if (item.decorator_id !== decoratorId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
      name = item.name;
      price = item.rental_price ? Number(item.rental_price) : 0;
      sourceItemId = item.id;
      items = [{ id: item.id, name: item.name, quantity: 1, price }];
    }

    // SEMPRE um token NOVO por clique. Não reaproveitamos rascunho da mesma
    // peça/kit: a decoradora pode mandar a MESMA peça para duas clientes; com
    // token compartilhado, a 1ª que preenchesse travaria o link e a 2ª tomaria
    // 409 — perdendo o orçamento em silêncio. O lixo de cliques acidentais é
    // resolvido pelo "Descartar link" na aba Clientes.
    const quote = await prisma.partyEvent.create({
      data: {
        id: `quote-${Date.now()}`,
        decorator_id: decoratorId,
        source_item_id: sourceItemId,
        source_kit_id: sourceKitId,
        public_token: randomUUID(),
        client_name: '',
        theme: name,
        total_value: price,
        status: EVENT_STATUS.AGUARDANDO_PREENCHIMENTO,
        tipo_link: tipo,
        retirada_em: retirada,
        devolucao_em: devolucao,
        items,
      },
    });

    return NextResponse.json({ token: quote.public_token });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
