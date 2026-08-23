import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';
import { EVENT_STATUS, effectiveStatus } from '@/lib/event-status';

// Ações da decoradora sobre o próprio orçamento/evento: confirmar, cancelar,
// descartar. SEMPRE autenticado e com checagem de posse (mesmo padrão do
// /api/quote-links) — nunca aceita decorator do corpo.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const decoratorId = await getSessionDecoratorId();
    if (!decoratorId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { id } = await params;
    const { action } = await request.json();

    const event = await prisma.partyEvent.findUnique({ where: { id } });
    if (!event) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });
    }
    // Posse: só o dono age sobre o próprio evento.
    if (event.decorator_id !== decoratorId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const current = effectiveStatus({ status: event.status as any, event_date: event.event_date?.toISOString() });

    if (action === 'confirm') {
      // Só confirma o que está aguardando confirmação. IRREVERSÍVEL (não há rota
      // de volta) — por isso a checagem estrita do estado de origem.
      if (event.status !== EVENT_STATUS.AGUARDANDO_CONFIRMACAO) {
        return NextResponse.json({ error: 'Só é possível confirmar um orçamento aguardando confirmação.' }, { status: 409 });
      }
      const updated = await prisma.partyEvent.update({ where: { id }, data: { status: EVENT_STATUS.CONFIRMADO } });
      return NextResponse.json({ status: updated.status });
    }

    if (action === 'cancel') {
      // Cancela um orçamento já preenchido/confirmado. Evento já ocorrido
      // (Finalizado) não cancela.
      if (event.status !== EVENT_STATUS.AGUARDANDO_CONFIRMACAO && event.status !== EVENT_STATUS.CONFIRMADO) {
        return NextResponse.json({ error: 'Este orçamento não pode ser cancelado.' }, { status: 409 });
      }
      if (current === EVENT_STATUS.FINALIZADO) {
        return NextResponse.json({ error: 'Evento já ocorrido não pode ser cancelado.' }, { status: 409 });
      }
      const updated = await prisma.partyEvent.update({ where: { id }, data: { status: EVENT_STATUS.CANCELADO } });
      return NextResponse.json({ status: updated.status });
    }

    if (action === 'discard') {
      // Descarta um link ainda NÃO preenchido — apaga o registro (some da lista).
      if (event.status !== EVENT_STATUS.AGUARDANDO_PREENCHIMENTO) {
        return NextResponse.json({ error: 'Só links não preenchidos podem ser descartados.' }, { status: 409 });
      }
      await prisma.partyEvent.delete({ where: { id } });
      return NextResponse.json({ discarded: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
