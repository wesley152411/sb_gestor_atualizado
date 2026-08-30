'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

// Aviso suave e DISPENSÁVEL para contas antigas sem CNPJ (o campo passou a ser
// obrigatório só para cadastros novos; as existentes preenchem quando puderem).
// Sem modal, sem bloqueio. Se a pessoa dispensar, não reaparece (localStorage).
const DISMISS_KEY = 'sbgestor_cnpj_banner_dismissed';

export function CnpjBanner() {
  const { decorator } = useAuthStore();
  // Começa oculto até ler o localStorage — evita o flash do banner em quem já dispensou.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1'); } catch { setDismissed(false); }
  }, []);

  if (dismissed) return null;
  if (!decorator || decorator.cnpj) return null; // só quando falta CNPJ

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* modo privado, etc. */ }
    setDismissed(true);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 16px',
      background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
      borderRadius: 10, padding: '10px 14px', fontSize: 13, lineHeight: 1.5,
    }}>
      <span style={{ flex: 1 }}>
        Complete seu <strong>CNPJ</strong> nas{' '}
        <Link href="/settings" style={{ color: '#92400e', fontWeight: 700, textDecoration: 'underline' }}>Configurações</Link>{' '}
        — vamos precisar dele para cobrança e nota fiscal.
      </span>
      <button
        type="button"
        onClick={close}
        aria-label="Dispensar aviso"
        title="Dispensar"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', display: 'flex', padding: 2 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
