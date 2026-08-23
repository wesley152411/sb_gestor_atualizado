import { prisma } from '@/lib/prisma';
import { toDbDate } from '@/lib/utils';
import { NextResponse } from 'next/server';
import { EVENT_STATUS } from '@/lib/event-status';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const quote = await prisma.partyEvent.findUnique({
      where: { public_token: token },
      include: {
        decorators: { select: { name: true, whatsapp: true } },
        inventory_items_quote: { select: { id: true, name: true, description: true, image_url: true, rental_price: true } },
        kits_quote: { select: { id: true, name: true, description: true, image_url: true, value: true, items: true } },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Link não encontrado' }, { status: 404 });
    }

    const isKit = !!quote.kits_quote;
    const card = isKit
      ? {
          id: quote.kits_quote!.id,
          name: quote.kits_quote!.name,
          description: quote.kits_quote!.description || '',
          image_url: quote.kits_quote!.image_url || '',
          price: quote.kits_quote!.value ? Number(quote.kits_quote!.value) : 0,
          isKit: true,
          items: (quote.kits_quote!.items as { id: string; name: string; quantity: number }[] | null) || [],
        }
      : {
          id: quote.inventory_items_quote?.id || '',
          name: quote.inventory_items_quote?.name || quote.theme || '',
          description: quote.inventory_items_quote?.description || '',
          image_url: quote.inventory_items_quote?.image_url || '',
          price: quote.inventory_items_quote?.rental_price ? Number(quote.inventory_items_quote.rental_price) : 0,
          isKit: false,
          items: [],
        };

    return NextResponse.json({
      token: quote.public_token,
      status: quote.status,
      decorator: { name: quote.decorators?.name || '', whatsapp: quote.decorators?.whatsapp || '' },
      card,
      client_name: quote.client_name,
      phone: quote.phone || '',
      address: quote.address || '',
      event_date: quote.event_date ? quote.event_date.toISOString().split('T')[0] : '',
      setup_time: quote.setup_time || '',
      start_time: quote.start_time || '',
      observation: quote.observation || '',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { name, phone, email, cpf, address, event_date, setup_time, start_time, observation } = body;

    if (!name || !event_date) {
      return NextResponse.json({ error: 'Nome e data do evento são obrigatórios' }, { status: 400 });
    }

    const quote = await prisma.partyEvent.findUnique({ where: { public_token: token } });
    if (!quote) {
      return NextResponse.json({ error: 'Link não encontrado' }, { status: 404 });
    }
    // O envio é DEFINITIVO: só o rascunho ("Aguardando preenchimento") aceita
    // POST. Qualquer outro estado (já enviado, confirmado, finalizado, cancelado)
    // retorna 409 — a cliente não reabre e reedita depois de enviar.
    if (quote.status !== EVENT_STATUS.AGUARDANDO_PREENCHIMENTO) {
      return NextResponse.json({ error: 'Este orçamento já foi enviado e não pode mais ser editado.' }, { status: 409 });
    }

    // Upsert Client: match by phone or CPF within the same decorator, to avoid duplicates.
    const decoratorId = quote.decorator_id;
    let client = null as null | { id: string };
    if (decoratorId) {
      const matchers: { phone?: string; cpf?: string }[] = [];
      if (phone) matchers.push({ phone });
      if (cpf) matchers.push({ cpf });

      client = matchers.length > 0
        ? await prisma.client.findFirst({ where: { decorator_id: decoratorId, OR: matchers } })
        : null;

      if (client) {
        await prisma.client.update({
          where: { id: client.id },
          data: { name, phone, email, cpf, address },
        });
      } else {
        client = await prisma.client.create({
          data: { id: `cli-${Date.now()}`, decorator_id: decoratorId, name, phone, email, cpf, address },
        });
      }
    }

    const updated = await prisma.partyEvent.update({
      where: { id: quote.id },
      data: {
        client_id: client?.id,
        client_name: name,
        phone,
        address,
        event_date: toDbDate(event_date),
        setup_time,
        start_time,
        observation: observation ?? null,
        // Envio recebido: passa a aguardar a confirmação da decoradora e registra
        // o momento do envio (ordena a aba Clientes do mais recente ao mais antigo).
        status: EVENT_STATUS.AGUARDANDO_CONFIRMACAO,
        submitted_at: new Date(),
      },
    });

    return NextResponse.json({ success: true, id: updated.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
