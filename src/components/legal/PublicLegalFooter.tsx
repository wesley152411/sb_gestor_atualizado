import Link from 'next/link';

export function PublicLegalFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={compact ? 'public-legal-footer compact' : 'public-legal-footer'}>
      <Link href="/privacidade">Política de Privacidade</Link>
      <Link href="/termos">Termos de Uso</Link>
    </footer>
  );
}
