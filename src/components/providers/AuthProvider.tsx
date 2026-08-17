'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSession, getMyProfile, ensureMyProfile, onAuthStateChange } from '@/services/api';
import { Logo } from '@/components/ui/Logo';
import { EmailConfirmationGate } from '@/components/providers/EmailConfirmationGate';

// Helper: race a promise against a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

type SessionUser = { id: string; email?: string; email_confirmed_at?: string | null; confirmed_at?: string | null };
type SessionLike = { user?: SessionUser } | null;

function isConfirmed(u?: SessionUser): boolean {
  return Boolean(u?.email_confirmed_at || u?.confirmed_at);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setDecorator, setLoading } = useAuthStore();
  const [initialized, setInitialized] = useState(false);
  // E-mail da sessão não confirmada => trava o app na tela de confirmação.
  const [gateEmail, setGateEmail] = useState<string | null>(null);

  useEffect(() => {
    // Resolve o estado a partir da sessão: confirmado => carrega perfil;
    // não confirmado => mostra o gate; sem sessão => nada.
    async function resolveSession(session: SessionLike) {
      const user = session?.user;
      if (user) {
        if (!isConfirmed(user)) {
          setGateEmail(user.email || '');
          setDecorator(null);
          return;
        }
        setGateEmail(null);
        let profile = await withTimeout(getMyProfile(), 15000, null);
        if (!profile) profile = await withTimeout(ensureMyProfile(), 15000, null);
        setDecorator(profile || null);
      } else {
        setGateEmail(null);
        setDecorator(null);
      }
    }

    async function initAuth() {
      try {
        const session = await withTimeout(getSession(), 15000, null);
        await resolveSession(session as SessionLike);
      } catch {
        setGateEmail(null);
        setDecorator(null);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    }

    initAuth();

    const subscription = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setGateEmail(null);
        setDecorator(null);
      } else {
        await resolveSession(session as SessionLike);
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

  if (gateEmail !== null) {
    return <EmailConfirmationGate email={gateEmail} />;
  }

  return <>{children}</>;
}
