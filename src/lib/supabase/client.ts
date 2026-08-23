import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;
let mailerInstance: ReturnType<typeof createClient> | null = null;
let connectionFailed = false;

// Guarda contra travamento de rede. 20s: com confirmação de e-mail ligada, o
// signUp envia o e-mail pelo SMTP DURANTE a requisição, o que passa de 2.5s.
const fetchWithTimeout: typeof fetch = (input, init) =>
  Promise.race([
    fetch(input, init),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new TypeError('Supabase fetch query timed out')), 20000)
    ),
  ]);

export function getSupabaseClient() {
  // If we already know the connection is bad, skip entirely
  if (connectionFailed) return null;
  if (supabaseInstance) return supabaseInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('Supabase credentials not found. Using localStorage fallback.');
    connectionFailed = true;
    return null;
  }

  try {
    supabaseInstance = createBrowserClient(url, key, {
      global: { fetch: fetchWithTimeout },
    });
    return supabaseInstance;
  } catch (err) {
    console.warn('Failed to initialize Supabase client. Using localStorage fallback.', err);
    connectionFailed = true;
    return null;
  }
}

// Cliente SÓ para DISPARAR e-mails (signUp, recuperação, reenvio).
// Por que separado: o createBrowserClient do @supabase/ssr FORÇA flowType 'pkce',
// e no PKCE o {{ .TokenHash }} do e-mail vira "pkce_..." — que o verifyOtp do
// /auth/confirm NÃO valida (o link caía na tela de erro). Este cliente usa
// flowType 'implicit', então o e-mail sai com um token_hash comum, validado no
// servidor de forma independente de navegador/dispositivo. Ele NÃO persiste
// sessão nem mexe nos cookies — a sessão de verdade continua a cargo do cliente
// SSR acima (login) e do /auth/confirm (confirmação/recuperação).
export function getSupabaseMailerClient() {
  if (connectionFailed) return null;
  if (mailerInstance) return mailerInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    mailerInstance = createClient(url, key, {
      auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetchWithTimeout },
    });
    return mailerInstance;
  } catch (err) {
    console.warn('Failed to initialize Supabase mailer client.', err);
    return null;
  }
}

// Call this if a Supabase operation fails, to disable further attempts
export function markSupabaseFailed() {
  connectionFailed = true;
  supabaseInstance = null;
}
