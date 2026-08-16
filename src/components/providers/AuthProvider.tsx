'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSession, getMyProfile, ensureMyProfile, onAuthStateChange } from '@/services/api';
import { Logo } from '@/components/ui/Logo';

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
          // Perfil PRÓPRIO pela sessão (/api/decorators/me). Se ainda não existe
          // (primeiro login pós-confirmação), cria de forma preguiçosa.
          let profile = await withTimeout(getMyProfile(), 15000, null);
          if (!profile) profile = await withTimeout(ensureMyProfile(), 15000, null);
          setDecorator(profile || null);
        } else {
          // Sem sessão => nenhuma decoradora.
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
        let profile = await getMyProfile();
        if (!profile) profile = await ensureMyProfile();
        setDecorator(profile || null);
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
