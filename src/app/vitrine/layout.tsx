import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter';

// Casca da vitrine pública: página aberta a qualquer pessoa, sem login. O
// rodapé legal fica aqui porque, fora do app, é o único acesso à Política de
// Privacidade — o mesmo motivo da casca do formulário de orçamento.
export default function VitrineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="vitrine-shell">
      {children}
      <PublicLegalFooter />
    </div>
  );
}
