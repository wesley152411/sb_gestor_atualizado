'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AlertTriangle, Lock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useAssinatura } from '@/components/providers/AssinaturaProvider';

// UM SLOT, UMA FAIXA.
//
// Empilhar tarjas empurra o conteúdo para baixo e faz a terceira deixar de ser
// lida. Quem ocupa o slot é a faixa que MAIS LIMITA o que ela pode fazer agora:
//
//   1. somente leitura — ela não consegue operar. Nada acima disso importa.
//   2. CNPJ            — obrigação fiscal pendente, mas ela ainda trabalha.
//   3. batimento       — operação interna, e SÓ o operador vê.
//
// O caso que a ordem resolve: suspensa E sem CNPJ. Pedir CNPJ a quem não consegue
// nem cadastrar cliente é ruído — ela não tem o que fazer com aquilo agora. O
// pedido volta sozinho na reativação, quando a faixa de leitura sai do slot.

const DISMISS_CNPJ = 'sbgestor_cnpj_banner_dismissed';

type Saude = {
  operador: boolean;
  nuncaRodou?: boolean;
  ultimaExecucao?: string | null;
  horasDesdeUltima?: number | null;
  atrasado?: boolean;
  divergencias?: number;
  ultimoResultado?: string | null;
};

const quando = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export function FaixaDeAviso() {
  const { decorator } = useAuthStore();
  const { somenteLeitura, carregando } = useAssinatura();
  const [saude, setSaude] = useState<Saude | null>(null);
  // Leitura do localStorage sem setState em efeito: o snapshot do servidor é
  // `true` (nada renderiza), e no cliente o valor real decide. Assim não há
  // descasamento de hidratação nem faixa piscando.
  const dispensadoNoArmazenamento = useSyncExternalStore(
    () => () => {},
    () => { try { return localStorage.getItem(DISMISS_CNPJ) === '1'; } catch { return false; } },
    () => true,
  );
  // O clique precisa re-renderizar; o armazenamento sozinho não avisa ninguém.
  const [dispensadoAgora, setDispensadoAgora] = useState(false);
  const cnpjDispensado = dispensadoNoArmazenamento || dispensadoAgora;

  useEffect(() => {
    let vivo = true;
    fetch('/api/billing/saude')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d) setSaude(d); })
      .catch(() => { /* a faixa nunca pode quebrar a casca do app */ });
    return () => { vivo = false; };
  }, []);

  // --- 1. Somente leitura -----------------------------------------------------
  if (!carregando && somenteLeitura) {
    return (
      <div className="faixa faixa-atencao" role="status">
        <Lock size={16} aria-hidden="true" />
        <span>
          Sua assinatura não está ativa. Você pode consultar seus dados, mas não fazer alterações.
        </span>
        <Link href="/assinatura" className="faixa-acao">Reativar assinatura</Link>
      </div>
    );
  }

  // --- 2. CNPJ ----------------------------------------------------------------
  if (decorator && !decorator.cnpj && !cnpjDispensado) {
    return (
      <div className="faixa faixa-atencao" role="status">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>Complete seu cadastro com o CNPJ para emitirmos os documentos fiscais.</span>
        <Link href="/settings" className="faixa-acao">Preencher</Link>
        <button
          type="button"
          className="faixa-dispensar"
          aria-label="Dispensar aviso"
          onClick={() => {
            try { localStorage.setItem(DISMISS_CNPJ, '1'); } catch { /* modo privado */ }
            setDispensadoAgora(true);
          }}
        >
          ×
        </button>
      </div>
    );
  }

  // --- 3. Batimento do job (só o operador) ------------------------------------
  if (saude?.operador) {
    if ((saude.divergencias ?? 0) > 0) {
      return (
        <div className="faixa faixa-grave" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>{saude.divergencias} assinatura(s) com valor divergente</strong> no Mercado Pago.
            O job tentou corrigir e não conseguiu — confira o workflow <code>reconciliacao</code>.
          </span>
        </div>
      );
    }
    if (saude.nuncaRodou || saude.atrasado) {
      return (
        <div className="faixa faixa-atencao" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {saude.nuncaRodou
              ? <>A reconciliação de cobrança <strong>nunca rodou</strong>.</>
              : <>A reconciliação de cobrança não roda desde <strong>{quando(saude.ultimaExecucao)}</strong>
                  {saude.horasDesdeUltima != null && ` (${saude.horasDesdeUltima}h)`}.</>}
            {' '}Verifique o workflow <code>reconciliacao</code> no GitHub Actions.
          </span>
        </div>
      );
    }
    if (saude.ultimoResultado === 'erro') {
      return (
        <div className="faixa faixa-atencao" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>A última reconciliação de cobrança falhou ({quando(saude.ultimaExecucao)}).</span>
        </div>
      );
    }
  }

  return null; // tudo em ordem: silêncio é o estado correto
}
