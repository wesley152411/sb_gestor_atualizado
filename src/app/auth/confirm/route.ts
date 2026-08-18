import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Confirmação de e-mail INDEPENDENTE de dispositivo/navegador.
// O link do e-mail traz um `token_hash` (não um code PKCE), validado AQUI no
// servidor via verifyOtp — então funciona mesmo que a pessoa se cadastre no
// computador e abra o e-mail no celular, ou clique dentro do app do Gmail.
//
// Sucesso: sessão da conta do link estabelecida (cookies sobrescritos) e vai ao
// app. Falha (token inválido/expirado/já usado): encerra qualquer sessão e vai
// ao login com erro — nunca cai silenciosamente na sessão preexistente.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const nextParam = searchParams.get('next') || '/';
  // Evita open-redirect: só caminho relativo interno.
  const next = nextParam.startsWith('/') ? nextParam : '/';

  const supabase = await createSupabaseServerClient();

  if (token_hash && type && supabase) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  if (supabase) {
    try { await supabase.auth.signOut(); } catch { /* ignora */ }
  }
  return NextResponse.redirect(`${origin}/login?erro=confirmacao`);
}
