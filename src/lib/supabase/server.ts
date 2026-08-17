import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente Supabase no SERVIDOR: lê a sessão do cookie e valida o usuário.
// Base do isolamento multi-conta — a identidade vem DAQUI, nunca do cliente.
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Em route handlers de leitura o cookie store é read-only; ignorar.
        }
      },
    },
  });
}

// Usuário da SESSÃO validada no servidor, com o estado de confirmação de e-mail.
// auth.getUser() valida o JWT junto ao Supabase (não é só decodificar o cookie).
export async function getSessionUser(): Promise<{ id: string; emailConfirmed: boolean } | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const u = data.user;
    // Confirmação NÃO pode depender só do painel: o servidor checa o flag.
    const emailConfirmed = Boolean(u.email_confirmed_at || u.confirmed_at);
    return { id: u.id, emailConfirmed };
  } catch {
    return null;
  }
}

// Id da decoradora derivado da SESSÃO validada. decorator.id === auth user.id.
// SEM sessão OU e-mail NÃO confirmado => null (as rotas de dados recusam igual
// a uma requisição sem sessão). É a barreira de servidor da confirmação.
export async function getSessionDecoratorId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user || !user.emailConfirmed) return null;
  return user.id;
}
