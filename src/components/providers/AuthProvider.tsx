'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSession, getDecorators, onAuthStateChange } from '@/services/api';
import type { Decorator } from '@/types';

// Helper: race a promise against a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setDecorator, setLoading } = useAuthStore();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    async function initAuth() {
      try {
        // Give Supabase 3s max to respond, then fallback
        const session = await withTimeout(getSession(), 3000, null);
        
        if (session?.user) {
          const decorators = await withTimeout(getDecorators(), 3000, []);
          const profile = decorators.find((d: Decorator) => d.id === (session.user as { id: string }).id);
          
          if (profile) {
            setDecorator(profile);
          } else {
            setDecorator(decorators[0] || null);
          }
        } else {
          // No session — use mock decorator for demo/development
          const decorators = await withTimeout(getDecorators(), 3000, []);
          setDecorator(decorators[0] || null);
        }
      } catch {
        // Fallback: try local data
        try {
          const decorators = await withTimeout(getDecorators(), 2000, []);
          setDecorator(decorators[0] || null);
        } catch {
          setDecorator(null);
        }
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    }

    initAuth();

    // Listen for auth state changes
    const subscription = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setDecorator(null);
      } else if (event === 'SIGNED_IN' && session) {
        const decorators = await getDecorators();
        const user = (session as { user?: { id: string } })?.user;
        if (user) {
          const profile = decorators.find((d: Decorator) => d.id === user.id);
          setDecorator(profile || decorators[0] || null);
        }
      }
    });

    return () => {
      subscription?.unsubscribe?.();
    };
  }, [setDecorator, setLoading]);

  if (!initialized) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#f1f5f9',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 50, height: 50, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, color: 'white',
          }}>SB</div>
          <p style={{ color: '#64748b', fontSize: 14 }}>Carregando SB GESTOR...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
