'use client';

import { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type Estado = {
  status: string;
  liberado: boolean;
  periodo_fim: string | null;
  proxima_cobranca: string | null;
  teste_fim: string | null;
  valor_centavos: number;
  ofereceTeste: boolean;
  reativacao: boolean;
};

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dia = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

// Cada status ganha uma frase que diz o que ele significa PARA ELA — não o nome
// interno do estado. "Inadimplente" não é mensagem para quem está pagando.
const DESCRICAO: Record<string, (e: Estado) => string> = {
  sem_assinatura: () => 'Você ainda não tem uma assinatura.',
  pendente: () => 'Sua assinatura está aguardando a confirmação do Mercado Pago.',
  em_teste: (e) => `Seu mês gratuito vai até ${dia(e.teste_fim)}. A primeira cobrança acontece nessa data.`,
  ativa: (e) => `Assinatura ativa. Próxima cobrança em ${dia(e.proxima_cobranca)}.`,
  inadimplente: (e) =>
    `Não conseguimos concluir a última cobrança. Seu acesso continua até ${dia(e.periodo_fim)} — ` +
    'atualize o meio de pagamento no Mercado Pago para não perdê-lo.',
  cancelada: (e) => `Assinatura cancelada. Seu acesso continua até ${dia(e.periodo_fim)}.`,
  suspensa: () => 'Seu acesso está suspenso porque a cobrança não foi regularizada.',
  expirada: () => 'Sua assinatura terminou. Seus dados ficam guardados por 90 dias.',
};

export default function AssinaturaPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    fetch('/api/billing/estado')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falha'))))
      .then((d) => { if (vivo) setEstado(d); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar sua assinatura.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  async function assinar() {
    setEnviando(true);
    setErro('');
    try {
      const res = await fetch('/api/billing/subscribe', { method: 'POST' });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok || !corpo.initPoint) {
        throw new Error(corpo.error || 'Não foi possível iniciar a assinatura.');
      }
      // Daqui em diante quem manda é o Mercado Pago. O retorno cai em
      // /assinatura/retorno, que confirma com o servidor — nunca pela URL.
      window.location.href = corpo.initPoint;
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível iniciar a assinatura.');
      setEnviando(false);
    }
  }

  if (carregando) return <div className="assinatura-page"><p>Carregando…</p></div>;

  const podeAssinar = !estado?.liberado || estado.status === 'cancelada';

  return (
    <div className="assinatura-page">
      <header className="assinatura-cabecalho">
        <h1>Assinatura</h1>
        <p>{estado ? (DESCRICAO[estado.status] ?? (() => 'Assinatura'))(estado) : ''}</p>
      </header>

      {erro && <p role="alert" className="assinatura-erro">{erro}</p>}

      <section className="assinatura-cartao">
        <div className="assinatura-preco">
          <span className="assinatura-valor">{reais(estado?.valor_centavos ?? 14990)}</span>
          <span className="assinatura-periodo">por mês</span>
        </div>

        <ul className="assinatura-itens">
          {estado?.ofereceTeste && (
            <li><ShieldCheck size={16} aria-hidden="true" /> <strong>1 mês grátis</strong> — a cobrança só começa depois</li>
          )}
          {estado?.reativacao && (
            <li><CalendarClock size={16} aria-hidden="true" /> Sua reativação começa a cobrar em {dia(estado.periodo_fim)}, quando o período que você já pagou termina</li>
          )}
          <li><CreditCard size={16} aria-hidden="true" /> Pagamento pelo Mercado Pago — não guardamos dados do seu cartão</li>
          <li><CalendarClock size={16} aria-hidden="true" /> Cancele quando quiser; o acesso vale até o fim do período pago</li>
        </ul>

        {podeAssinar ? (
          <Button type="button" className="w-full" size="lg" isLoading={enviando} onClick={assinar}>
            {estado?.reativacao ? 'Reativar assinatura' : estado?.ofereceTeste ? 'Começar mês grátis' : 'Assinar'}
          </Button>
        ) : (
          <p className="assinatura-ok">Sua assinatura está em dia.</p>
        )}

        <p className="assinatura-nota">
          Ao continuar você será levada ao Mercado Pago para autorizar a cobrança recorrente.
        </p>
      </section>
    </div>
  );
}
