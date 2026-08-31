import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { ensureDecoratorProfile } from '@/lib/legal';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user || !(user.email_confirmed_at || user.confirmed_at)) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  // Sem linha de perfil o updateMany marcaria ZERO linhas e mesmo assim a tela
  // prometeria exclusao em 15 dias — pedido perdido em silencio, justamente na
  // acao com peso legal. Semeia a linha primeiro.
  await ensureDecoratorProfile(user);
  const marcadas = await prisma.decorator.updateMany({
    where: { id: user.id, deletion_requested_at: null },
    data: { deletion_requested_at: new Date() },
  });

  // AVISO AO OPERADOR. O registro no banco é a fonte de verdade (listada por
  // scripts/pending-deletions.cjs), mas um registro que ninguém olha não é
  // processo: esta linha sai nos logs de Functions da Netlify com uma etiqueta
  // única, fácil de buscar. O prazo prometido na tela é de 15 dias.
  if (marcadas.count > 0) {
    console.warn(
      `[EXCLUSAO-SOLICITADA] decorator=${user.id} email=${user.email ?? '(sem e-mail)'} ` +
      `em=${new Date().toISOString()} prazo=15d — rode: node scripts/pending-deletions.cjs --env=prod --expect-ref=<ref>`
    );
  } else {
    // Ja havia um pedido em aberto (deletion_requested_at preenchido). Confirma de
    // novo, sem sobrescrever a data original — o prazo conta do primeiro pedido.
    const pendente = await prisma.decorator.findUnique({ where: { id: user.id }, select: { deletion_requested_at: true } });
    if (!pendente?.deletion_requested_at) {
      console.error(`[EXCLUSAO-SOLICITADA] FALHA ao registrar o pedido de ${user.id} — nada foi gravado.`);
      return NextResponse.json({ error: 'Não foi possível registrar sua recusa. Tente novamente.' }, { status: 500 });
    }
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
