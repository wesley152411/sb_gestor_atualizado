import { createBrowserClient } from '@supabase/ssr';

let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;
let connectionFailed = false;

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

  // Validate that the key looks valid (Supabase anon keys are JWTs starting with "eyJ")
  if (!key.startsWith('eyJ')) {
    console.warn('Supabase anon key appears invalid. Using localStorage fallback.');
    connectionFailed = true;
    return null;
  }

  supabaseInstance = createBrowserClient(url, key);
  return supabaseInstance;
}

// Call this if a Supabase operation fails, to disable further attempts
export function markSupabaseFailed() {
  connectionFailed = true;
  supabaseInstance = null;
}
