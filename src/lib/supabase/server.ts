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

// Id da decoradora derivado da SESSÃO validada no servidor.
// auth.getUser() valida o JWT junto ao Supabase (não é só decodificar o cookie).
// decorator.id === auth user.id (ver createDecoratorFromAuth). Sem sessão => null.
export async function getSessionDecoratorId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
