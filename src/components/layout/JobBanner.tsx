'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

// A FAIXA DO BATIMENTO.
//
// Existe por causa de um cron que ficou vermelho por semanas sem ninguém notar.
// O e-mail de falha do GitHub Actions cobre "rodou e deu erro"; não cobre
// "deixou de rodar" — workflow desabilitado, arquivo renomeado, ou a suspensão
// automática de agendamentos após 60 dias sem atividade no repositório. Nesses
// casos não há falha, há AUSÊNCIA, e ausência não dispara nada.
//
// Por isso o vigia é esta tela, que é aberta todo dia, e não outro processo que
// também pode morrer calado.

type Saude = {
  nuncaRodou: boolean;
  ultimaExecucao: string | null;
  horasDesdeUltima: number | null;
  atrasado: boolean;
  divergencias: number;
  ultimoResultado: string | null;
};

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export function JobBanner() {
  const [saude, setSaude] = useState<Saude | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/billing/saude')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d) setSaude(d); })
      .catch(() => { /* a faixa não pode quebrar a casca do app */ });
    return () => { vivo = false; };
  }, []);

  if (!saude) return null;

  // Divergência vem primeiro: é dinheiro sendo cobrado errado agora.
  if (saude.divergencias > 0) {
    return (
      <div className="job-banner job-banner-grave" role="alert">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          <strong>{saude.divergencias} assinatura(s) com valor divergente</strong> no Mercado Pago.
          O job tentou corrigir e não conseguiu — confira o workflow <code>reconciliacao</code>.
        </span>
      </div>
    );
  }

  if (saude.nuncaRodou) {
    return (
      <div className="job-banner" role="alert">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          A reconciliação de cobrança <strong>nunca rodou</strong>. Enquanto isso, cobrança
          divergente e assinatura pendente não são corrigidas sozinhas.
        </span>
      </div>
    );
  }

  if (saude.atrasado) {
    return (
      <div className="job-banner" role="alert">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          A reconciliação de cobrança não roda desde <strong>{quando(saude.ultimaExecucao)}</strong>
          {saude.horasDesdeUltima !== null && ` (${saude.horasDesdeUltima}h)`}.
          Verifique o workflow <code>reconciliacao</code> no GitHub Actions.
        </span>
      </div>
    );
  }

  if (saude.ultimoResultado === 'erro') {
    return (
      <div className="job-banner" role="alert">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>A última reconciliação de cobrança falhou ({quando(saude.ultimaExecucao)}).</span>
      </div>
    );
  }

  return null; // rodando em dia: silêncio é o estado correto
}
