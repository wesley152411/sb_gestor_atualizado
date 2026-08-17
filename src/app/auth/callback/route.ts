import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Rota de RETORNO da confirmação de e-mail (fluxo PKCE).
// O link do e-mail traz um `code` que PRECISA ser trocado por uma sessão. Sem
// esta troca, o link caía na raiz do app e a sessão anterior (ex.: outra conta)
// prevalecia — clicar no link levava à conta errada.
//
// Garantias:
//  - Sucesso: a sessão da conta DO LINK é estabelecida (os cookies de sessão
//    são sobrescritos), então nunca resulta na conta anterior.
//  - Falha (sem code, token inválido/expirado/já usado): encerra QUALQUER sessão
//    existente e manda para o login com erro — nunca cai silenciosamente na
//    sessão preexistente.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const supabase = await createSupabaseServerClient();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  if (supabase) {
    try { await supabase.auth.signOut(); } catch { /* ignora */ }
  }
  return NextResponse.redirect(`${origin}/login?erro=confirmacao`);
}
