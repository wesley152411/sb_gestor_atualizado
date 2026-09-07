'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// Estado da assinatura disponível para as telas, carregado UMA vez no boot.
//
// Existe por um motivo concreto: faixa é aviso, não impedimento. Sem isto, os
// botões de criar e apagar continuariam ativos para quem está em somente-leitura,
// e ela descobriria o bloqueio clicando e tomando erro — pior do que não avisar.
//
// Uma requisição a mais no boot é preço baixo perto de seis telas consultando por
// conta própria e dessincronizando entre si.

export type EstadoAssinatura = {
  status: string;
  liberado: boolean;       // pode OPERAR
  somenteLeitura: boolean; // já assinou, mas não pode operar agora
  periodo_fim: string | null;
  // Usados pelo portão de quem nunca assinou: a tela precisa dizer o preço e se
  // o mês grátis ainda está disponível ANTES de mandar a pessoa ao Mercado Pago.
  ofereceTeste: boolean;
  valorCentavos: number;
  carregando: boolean;
};

const PADRAO: EstadoAssinatura = {
  status: 'desconhecido',
  liberado: true,          // otimista enquanto carrega: não pisca a interface
  somenteLeitura: false,
  periodo_fim: null,
  ofereceTeste: false,
  valorCentavos: 14990,
  carregando: true,
};

const Contexto = createContext<EstadoAssinatura>(PADRAO);

/** Lê o estado da assinatura nas telas. O servidor continua sendo a autoridade. */
export function useAssinatura() {
  return useContext(Contexto);
}

/**
 * Conveniência para desabilitar ação de escrita.
 *
 * Enquanto carrega devolve `false` de propósito: bloquear o botão por um instante
 * e liberar depois pisca; e o servidor recusa de qualquer forma se não puder
 * operar. A interface aqui é cortesia, não barreira.
 */
export function useBloqueioDeEscrita(): { bloqueado: boolean; motivo: string | undefined } {
  const { somenteLeitura, carregando } = useAssinatura();
  const bloqueado = !carregando && somenteLeitura;
  return {
    bloqueado,
    motivo: bloqueado ? 'Sua assinatura não está ativa. Reative para voltar a fazer alterações.' : undefined,
  };
}

export function AssinaturaProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoAssinatura>(PADRAO);

  useEffect(() => {
    let vivo = true;
    fetch('/api/billing/estado')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) { if (vivo) setEstado((e) => ({ ...e, carregando: false })); return; }
        setEstado({
          status: d.status,
          liberado: Boolean(d.liberado),
          // Somente-leitura é o estado de quem JÁ assinou e não pode operar. Quem
          // nunca assinou não é "somente leitura": é uma tela de assinatura.
          somenteLeitura: !d.liberado && d.status !== 'sem_assinatura' && d.status !== 'pendente',
          periodo_fim: d.periodo_fim ?? null,
          ofereceTeste: Boolean(d.ofereceTeste),
          valorCentavos: Number(d.valor_centavos) || 14990,
          carregando: false,
        });
      })
      .catch(() => { if (vivo) setEstado((e) => ({ ...e, carregando: false })); });
    return () => { vivo = false; };
  }, []);

  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>;
}
