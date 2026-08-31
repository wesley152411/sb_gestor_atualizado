'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function LegalAcceptanceGate({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState('');
  const [declined, setDeclined] = useState(false);

  async function accept() {
    if (!checked) { setError('Marque a caixa para confirmar seu aceite.'); return; }
    setLoading(true); setError('');
    try { await onAccepted(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível registrar o aceite.'); }
    finally { setLoading(false); }
  }
  async function decline() {
    setDeclining(true); setError('');
    try {
      const res = await fetch('/api/legal/decline', { method: 'POST' });
      if (!res.ok) throw new Error('Não foi possível registrar sua recusa. Tente novamente.');
      setDeclined(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível registrar sua recusa.'); }
    finally { setDeclining(false); }
  }

  if (declined) return <main className="legal-gate-page"><section className="legal-gate-card"><ShieldCheck size={32} aria-hidden="true" /><h1>Recebemos seu pedido</h1><p>Sua conta e seus dados serão excluídos em até 15 dias, e você receberá a confirmação por e-mail.</p></section></main>;
  return (
    <main className="legal-gate-page"><section className="legal-gate-card">
      <ShieldCheck size={32} aria-hidden="true" />
      <h1>Antes de continuar</h1>
      <p>Para usar o SB Gestor, revise e aceite os documentos atuais.</p>
      <label className="legal-consent"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>Li e concordo com a <Link href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link> e os <Link href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</Link>.</span>
      </label>
      {error && <p role="alert" className="legal-error">{error}</p>}
      <Button type="button" className="w-full" size="lg" isLoading={loading} onClick={accept}>Aceitar e continuar</Button>
      <button type="button" className="legal-decline" disabled={declining} onClick={decline}>{declining ? 'Registrando…' : 'Não concordo'}</button>
    </section></main>
  );
}
