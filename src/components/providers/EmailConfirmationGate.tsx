'use client';

import { useEffect, useState } from 'react';
import { resendConfirmation, signOut } from '@/services/api';
import { Logo } from '@/components/ui/Logo';

// Tela mostrada quando há sessão MAS o e-mail não foi confirmado. Bloqueia o
// sistema (a barreira de verdade é o servidor; esta tela é a experiência).
export function EmailConfirmationGate({ email }: { email: string }) {
  const [cooldown, setCooldown] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleResend() {
    if (cooldown > 0 || sending) return; // protege contra cliques repetidos
    setSending(true);
    setMsg(null);
    const r = await resendConfirmation(email);
    setMsg({ ok: !!r.success, text: r.message || (r.success ? 'Reenviado.' : 'Falhou.') });
    setSending(false);
    if (r.success) setCooldown(60);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#f1f5f9', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, padding: '36px 32px', width: '100%',
        maxWidth: 440, boxShadow: '0 16px 50px rgba(0,0,0,0.12)', textAlign: 'center',
      }}>
        <div style={{ width: 52, height: 52, margin: '0 auto 18px' }}>
          <Logo size={52} />
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 800, margin: '0 0 8px', color: '#0f1e26' }}>
          Confirme seu e-mail para continuar
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569', margin: '0 0 6px' }}>
          Enviamos um link de confirmação para:
        </p>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0088B0', margin: '0 0 18px', wordBreak: 'break-all' }}>
          {email}
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#64748b', margin: '0 0 22px' }}>
          Clique no link do e-mail para ativar sua conta. Depois, volte aqui e atualize —
          seu acesso é liberado na hora.
        </p>

        {msg && (
          <div style={{
            background: msg.ok ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${msg.ok ? '#a7f3d0' : '#fecaca'}`,
            color: msg.ok ? '#047857' : '#dc2626',
            borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 16,
          }}>{msg.text}</div>
        )}

        <button
          onClick={() => window.location.reload()}
          style={{
            width: '100%', background: '#0088B0', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
            marginBottom: 10,
          }}
        >
          Já confirmei — atualizar
        </button>

        <button
          onClick={handleResend}
          disabled={cooldown > 0 || sending}
          style={{
            width: '100%', background: 'transparent', color: cooldown > 0 || sending ? '#94a3b8' : '#0088B0',
            border: '1px solid #cbd5e1', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700,
            cursor: cooldown > 0 || sending ? 'not-allowed' : 'pointer', marginBottom: 18,
          }}
        >
          {sending ? 'Enviando…' : cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar e-mail de confirmação'}
        </button>

        <button
          onClick={async () => { await signOut(); window.location.href = '/login'; }}
          style={{
            background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Usar outra conta / sair
        </button>
      </div>
    </div>
  );
}
