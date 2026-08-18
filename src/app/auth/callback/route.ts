import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Base pública da requisição. Atrás do Netlify, request.url traz o host INTERNO
// do deploy (main--...netlify.app); o host público real vem em x-forwarded-host.
function publicBase(request: Request): string {
  const host = request.headers.get('x-forwarded-host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

// Rota de RETORNO da confirmação de e-mail (fluxo PKCE — mantida como fallback).
// O caminho principal agora é /auth/confirm (token_hash, independente de navegador).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const base = publicBase(request);
  const supabase = await createSupabaseServerClient();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}/`);
    }
  }

  if (supabase) {
    try { await supabase.auth.signOut(); } catch { /* ignora */ }
  }
  return NextResponse.redirect(`${base}/login?erro=confirmacao`);
}
