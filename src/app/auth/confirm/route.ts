import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Base pública da requisição. Atrás do Netlify, request.url traz o host INTERNO
// do deploy (main--...netlify.app); o host público real vem em x-forwarded-host.
function publicBase(request: Request): string {
  const host = request.headers.get('x-forwarded-host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin; // dev/local: origin já é o correto
}

// Confirmação de e-mail INDEPENDENTE de dispositivo/navegador.
// O link do e-mail traz um `token_hash` (não um code PKCE), validado AQUI no
// servidor via verifyOtp — então funciona mesmo que a pessoa se cadastre no
// computador e abra o e-mail no celular, ou clique dentro do app do Gmail.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const nextParam = searchParams.get('next') || '/';
  const next = nextParam.startsWith('/') ? nextParam : '/'; // evita open-redirect
  const base = publicBase(request);

  const supabase = await createSupabaseServerClient();

  if (token_hash && type && supabase) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  if (supabase) {
    try { await supabase.auth.signOut(); } catch { /* ignora */ }
  }
  return NextResponse.redirect(`${base}/login?erro=confirmacao`);
}
