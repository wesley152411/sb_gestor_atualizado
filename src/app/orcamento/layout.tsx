import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter';

// Casca do formulário público de orçamento. Existe só para pendurar o rodapé
// legal em TODOS os estados da página (carregando, link inexistente, formulário,
// agradecimento, cancelado) sem repetir o componente em cada `return`. A cliente
// final precisa alcançar a Política de Privacidade a partir daqui.
export default function OrcamentoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="quote-shell">
      {children}
      <PublicLegalFooter />
    </div>
  );
}
