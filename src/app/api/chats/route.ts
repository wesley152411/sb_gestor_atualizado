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

    const { searchParams } = new URL(request.url);
    const decoratorA = searchParams.get('decoratorA');
    const decoratorB = searchParams.get('decoratorB');

    // Modo CONVERSA: só quem participa pode ler. Uma terceira conta forjando os
    // dois ids não acessa a conversa alheia (403).
    if (decoratorA && decoratorB) {
      if (sessionId !== decoratorA && sessionId !== decoratorB) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
      const other = sessionId === decoratorA ? decoratorB : decoratorA;
      const messages = await prisma.chatMessage.findMany({
        where: {
          OR: [
            { sender_id: sessionId, receiver_id: other },
            { sender_id: other, receiver_id: sessionId },
          ],
        },
        orderBy: { created_at: 'asc' },
      });
      return NextResponse.json(messages);
    }

    // Modo LISTA: sempre as conversas da PRÓPRIA sessão (ignora ?decoratorId=).
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [{ sender_id: sessionId }, { receiver_id: sessionId }],
      },
      orderBy: { created_at: 'asc' },
    });
    return NextResponse.json(messages);
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
    const { id, receiver_id, message } = body;
    if (!id || !receiver_id || !message) {
      return NextResponse.json({ error: 'id, receiver_id e message são obrigatórios' }, { status: 400 });
    }

    // O remetente é SEMPRE a sessão — ninguém posta em nome de outra conta.
    const created = await prisma.chatMessage.create({
      data: { id, sender_id: sessionId, receiver_id, message },
    });

    return NextResponse.json(created);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
