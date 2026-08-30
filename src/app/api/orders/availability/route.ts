import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';
import { availableForLine } from '@/lib/rental-availability';

// Disponível de uma peça/kit num período — o modal chama ao escolher as datas
// para mostrar "X de Y disponíveis para DD/MM–DD/MM". É só uma DICA de UI: a
// autoridade final é a checagem com trava no POST /api/orders (evita corrida).
export async function GET(request: Request) {
  const sessionId = await getSessionDecoratorId();
  if (!sessionId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  const kitId = searchParams.get('kitId');
  const pickup = searchParams.get('pickup');
  const ret = searchParams.get('return');

  if ((!itemId && !kitId) || !pickup || !ret) {
    return NextResponse.json({ error: 'Parâmetros: (itemId ou kitId), pickup, return.' }, { status: 400 });
  }

  try {
    const available = await availableForLine(prisma, { item_id: itemId, kit_id: kitId }, pickup, ret);
    return NextResponse.json({ available });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
