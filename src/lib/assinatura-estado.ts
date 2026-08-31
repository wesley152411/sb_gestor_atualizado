// Núcleo PURO da decisão de estado da assinatura: dado o que o Mercado Pago diz
// e o que já temos gravado, qual é o novo estado local. Sem 'server-only', sem
// banco e sem rede — para poder ser testado de verdade, que é o que importa numa
// função que decide se alguém tem acesso e até quando.

export type StatusLocal =
  | 'pendente'
  | 'em_teste'
  | 'ativa'
  | 'inadimplente'
  | 'cancelada'
  | 'suspensa'
  | 'expirada';

/** O recorte da preapproval do MP que nos interessa. */
export type PreapprovalMP = {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  payer_id?: number | string | null;
  next_payment_date?: string | null;
  auto_recurring?: {
    transaction_amount?: number | null;
    free_trial?: { frequency?: number; frequency_type?: string; first_invoice_offset?: number } | null;
  } | null;
  summarized?: { charged_quantity?: number | null } | null;
};

export type EstadoAnterior = {
  status: StatusLocal;
  periodo_fim: Date | null;
  teste_fim: Date | null;
  vigente: boolean;
};

export type NovoEstado = {
  status: StatusLocal;
  vigente: boolean;
  periodo_fim: Date | null;
  proxima_cobranca: Date | null;
  teste_fim: Date | null;
  valor_centavos_mp: number | null;
  mp_payer_id: string | null;
};

// 149.9 * 100 dá 14990.000000000002 em ponto flutuante. Sem o arredondamento, o
// truncamento devolveria 14990 num caso e 14989 noutro — centavo somem em silêncio.
export function reaisParaCentavos(valor: number): number {
  return Math.round(valor * 100);
}

export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100;
}

function data(valor?: string | null): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

// O acesso já concedido nunca encurta. Se o MP deixar de informar a próxima
// cobrança — o que acontece ao cancelar —, vale o que já estava gravado.
function periodoNuncaAndaParaTras(anterior: Date | null, novo: Date | null): Date | null {
  if (!novo) return anterior;
  if (!anterior) return novo;
  return novo.getTime() > anterior.getTime() ? novo : anterior;
}

/**
 * Traduz o estado remoto para o nosso. É a função que o retorno do navegador e o
 * webhook compartilham — por isso é pura e determinística: mesma entrada, mesma
 * saída, rodando dez vezes ou uma.
 */
export function calcularEstado(mp: PreapprovalMP, anterior: EstadoAnterior, agora: Date): NovoEstado {
  const proxima = data(mp.next_payment_date);
  const valorMp = mp.auto_recurring?.transaction_amount;
  const valor_centavos_mp = typeof valorMp === 'number' ? reaisParaCentavos(valorMp) : null;
  const mp_payer_id = mp.payer_id === null || mp.payer_id === undefined ? null : String(mp.payer_id);

  // Está no teste grátis enquanto houver free_trial, nenhuma cobrança tiver saído
  // e a primeira ainda estiver no futuro.
  const temTeste = Boolean(mp.auto_recurring?.free_trial);
  const cobrancas = mp.summarized?.charged_quantity ?? 0;
  const noTeste = temTeste && cobrancas === 0 && proxima !== null && proxima.getTime() > agora.getTime();

  const base = {
    proxima_cobranca: proxima,
    valor_centavos_mp,
    mp_payer_id,
  };

  switch (mp.status) {
    case 'authorized': {
      const periodo_fim = periodoNuncaAndaParaTras(anterior.periodo_fim, proxima);
      return {
        ...base,
        status: noTeste ? 'em_teste' : 'ativa',
        vigente: true,
        periodo_fim,
        teste_fim: noTeste ? (proxima ?? anterior.teste_fim) : anterior.teste_fim,
      };
    }

    case 'paused': {
      // O MP pausa quando a cobrança falha. O acesso segue até o fim do período
      // já pago (Termos 5.3); quem suspende de fato é o job, quando esse fim passa.
      const periodo_fim = periodoNuncaAndaParaTras(anterior.periodo_fim, proxima);
      const vencido = periodo_fim !== null && periodo_fim.getTime() <= agora.getTime();
      return {
        ...base,
        status: vencido ? 'suspensa' : 'inadimplente',
        vigente: true,
        periodo_fim,
        teste_fim: anterior.teste_fim,
      };
    }

    case 'cancelled': {
      // Cancelar NÃO corta na hora: o acesso vale até o fim do período pago
      // (Termos 6.2). Ao cancelar, o MP zera next_payment_date — por isso o
      // periodo_fim anterior é preservado, e não sobrescrito com null.
      const periodo_fim = periodoNuncaAndaParaTras(anterior.periodo_fim, null);
      const vencido = periodo_fim === null || periodo_fim.getTime() <= agora.getTime();
      return {
        ...base,
        proxima_cobranca: null,
        status: vencido ? 'expirada' : 'cancelada',
        vigente: !vencido,
        periodo_fim,
        teste_fim: anterior.teste_fim,
      };
    }

    case 'pending':
    default: {
      // Ainda não autorizada: não concede nada e não vira a linha vigente.
      return {
        ...base,
        status: 'pendente',
        vigente: false,
        periodo_fim: anterior.periodo_fim,
        teste_fim: anterior.teste_fim,
      };
    }
  }
}

/** O estado libera acesso agora? É a pergunta que o gate faz. */
export function concedeAcesso(estado: { status: StatusLocal; periodo_fim: Date | null }, agora: Date): boolean {
  if (!['em_teste', 'ativa', 'inadimplente', 'cancelada'].includes(estado.status)) return false;
  return estado.periodo_fim === null || estado.periodo_fim.getTime() > agora.getTime();
}
