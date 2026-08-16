'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSession, getDecorators, onAuthStateChange } from '@/services/api';
import { Logo } from '@/components/ui/Logo';
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
        // Give Supabase 15s max to respond, then fallback
        const session = await withTimeout(getSession(), 15000, null);
        
        if (session?.user) {
          const decorators = await withTimeout(getDecorators(), 15000, []);
          const profile = decorators.find((d: Decorator) => d.id === (session.user as { id: string }).id);
          // SEGURANÇA: NUNCA cair para decorators[0]. Impersonar outra conta era a
          // causa de uma conta ver os dados de outra. Sem perfil correspondente à
          // sessão => nenhuma decoradora ativa (o usuário não vê dados de terceiros).
          setDecorator(profile || null);
        } else {
          // Sem sessão => nenhuma decoradora (nada de dados de demonstração de outra conta).
          setDecorator(null);
        }
      } catch {
        // Em erro, também não impersonamos ninguém.
        setDecorator(null);
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
          // SEGURANÇA: sem perfil correspondente, não impersonar decorators[0].
          setDecorator(profile || null);
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
          <div style={{ width: 56, height: 56, margin: '0 auto 16px' }} className="sb-logo-pulse">
            <Logo size={56} />
          </div>
          <p style={{ color: '#0088B0', fontSize: 14, fontWeight: 600 }}>Carregando SB GESTOR...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
