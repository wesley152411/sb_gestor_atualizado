import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureDecoratorProfile, legalContextForAcceptance, materializeSignupLegalAcceptance, recordCurrentLegalAcceptance } from '@/lib/legal';

async function userForLegal() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !(data.user.email_confirmed_at || data.user.confirmed_at)) return null;
  return data.user;
}

export async function GET(request: Request) {
  const user = await userForLegal();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const status = await materializeSignupLegalAcceptance(user.id, (user.user_metadata || {}) as Record<string, unknown>, request.headers);
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const user = await userForLegal();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.accept !== true) return NextResponse.json({ error: 'Confirme a leitura dos documentos para continuar.' }, { status: 400 });
  await ensureDecoratorProfile(user);
  const context = await legalContextForAcceptance(user.id);
  const status = await recordCurrentLegalAcceptance(user.id, request.headers, context);
  return NextResponse.json(status);
}
