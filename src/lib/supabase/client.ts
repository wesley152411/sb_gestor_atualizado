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

  // Initialize client with credentials from environment and set a 2.5s network timeout
  try {
    supabaseInstance = createBrowserClient(url, key, {
      global: {
        fetch: (input, init) => {
          return Promise.race([
            fetch(input, init),
            new Promise<Response>((_, reject) =>
              setTimeout(() => reject(new TypeError('Supabase fetch query timed out')), 2500)
            )
          ]);
        }
      }
    });
    return supabaseInstance;
  } catch (err) {
    console.warn('Failed to initialize Supabase client. Using localStorage fallback.', err);
    connectionFailed = true;
    return null;
  }
}

// Call this if a Supabase operation fails, to disable further attempts
export function markSupabaseFailed() {
  connectionFailed = true;
  supabaseInstance = null;
}
