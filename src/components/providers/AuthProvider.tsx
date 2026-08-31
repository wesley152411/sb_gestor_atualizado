'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSession, getMyProfile, ensureMyProfile, onAuthStateChange, getLegalAcceptanceStatus, acceptCurrentLegalDocuments } from '@/services/api';
import { Logo } from '@/components/ui/Logo';
import { EmailConfirmationGate } from '@/components/providers/EmailConfirmationGate';
import { onLegalAcceptanceRequired } from '@/lib/legal-gate-signal';
import { LegalAcceptanceGate } from '@/components/providers/LegalAcceptanceGate';

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

// Estados de auth do wrapper das rotas autenticadas:
//   loading   — ainda resolvendo a sessão (mostra o loader).
//   authed    — sessão válida e confirmada (renderiza o app, mesmo se o perfil
//               ainda não carregou — isso é problema de dados, não de sessão).
//   gate      — sessão presente mas e-mail não confirmado (tela de confirmação).
//   nosession — SEM sessão válida: NÃO renderiza a casca; manda para o /login.
type AuthStatus = 'loading' | 'authed' | 'gate' | 'legal' | 'nosession';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setDecorator, setLoading } = useAuthStore();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [gateEmail, setGateEmail] = useState<string | null>(null);

  useEffect(() => {
    // Resolve o estado a partir da sessão. A distinção que importa para o bug:
    // "sem sessão" (=> /login) é diferente de "sessão ok, perfil não carregou"
    // (=> segue autenticado; as páginas lidam com decorator null).
    async function resolveSession(session: SessionLike) {
      const user = session?.user;
      if (!user) {
        setGateEmail(null);
        setDecorator(null);
        setStatus('nosession');
        return;
      }
      if (!isConfirmed(user)) {
        setGateEmail(user.email || '');
        setDecorator(null);
        setStatus('gate');
        return;
      }
      setGateEmail(null);
      let profile = await withTimeout(getMyProfile(), 15000, null);
      if (!profile) profile = await withTimeout(ensureMyProfile(), 15000, null);
      setDecorator(profile || null);
      try {
        const legal = await getLegalAcceptanceStatus();
        setStatus(legal.accepted ? 'authed' : 'legal');
      } catch {
        setStatus('legal');
      }
    }

    async function initAuth() {
      try {
        const session = await withTimeout(getSession(), 15000, null);
        await resolveSession(session as SessionLike);
      } catch {
        // Não conseguimos confirmar a sessão => tratamos como não autenticado e
        // mandamos para o login, em vez de renderizar a casca vazia (o bug).
        setGateEmail(null);
        setDecorator(null);
        setStatus('nosession');
      } finally {
        setLoading(false);
      }
    }

    initAuth();

    const subscription = onAuthStateChange(async (event, session) => {
      // Sessão perdida durante o uso (logout, storage limpo, token expirado):
      // vai para o login em vez de deixar a casca sem sessão.
      if (event === 'SIGNED_OUT' || !session) {
        setGateEmail(null);
        setDecorator(null);
        setStatus('nosession');
      } else {
        await resolveSession(session as SessionLike);
      }
    });

    return () => {
      subscription?.unsubscribe?.();
    };
  }, [setDecorator, setLoading]);

  // Documentos versionados no meio da sessão: o servidor passa a devolver 403 em
  // toda rota de dados, mas a aba já aberta não remonta o provider e continuaria
  // mostrando tela vazia. Ao primeiro 403 do gate, CONFIRMA com o servidor antes
  // de trocar de estado — sem essa confirmação, um 403 atrasado chegando logo
  // depois do aceite jogaria a decoradora de volta ao gate sem motivo.
  useEffect(() => {
    let verificando = false;
    return onLegalAcceptanceRequired(async () => {
      if (verificando) return;
      verificando = true;
      try {
        const legal = await getLegalAcceptanceStatus();
        if (!legal.accepted) setStatus((atual) => (atual === 'authed' ? 'legal' : atual));
      } catch {
        // Sem resposta confiável, não tira a decoradora do app na marra.
      } finally {
        verificando = false;
      }
    });
  }, []);

  // Sem sessão válida: redireciona para o login ANTES de renderizar qualquer
  // parte do app. replace() para não deixar a tela quebrada no histórico (voltar
  // não retorna à casca vazia). Enquanto navega, mostra o loader — nunca a casca.
  useEffect(() => {
    if (status === 'nosession' && typeof window !== 'undefined') {
      window.location.replace('/login');
    }
  }, [status]);

  if (status === 'gate' && gateEmail !== null) {
    return <EmailConfirmationGate email={gateEmail} />;
  }

  if (status === 'legal') {
    return <LegalAcceptanceGate onAccepted={async () => { await acceptCurrentLegalDocuments(); setStatus('authed'); }} />;
  }

  // loading e nosession mostram o loader (nosession está redirecionando).
  if (status !== 'authed') {
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
