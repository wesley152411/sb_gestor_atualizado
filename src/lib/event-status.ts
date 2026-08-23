import type { EventStatus } from '@/types';

// ==================== CICLO DE VIDA DO ORÇAMENTO/EVENTO ====================
// Fonte ÚNICA da verdade sobre os status do PartyEvent. Todo consumidor (aba
// Clientes, Dashboard, Calendário, Header, formulário, rotas) deve derivar daqui
// — nunca comparar strings soltas — para os cinco estados não divergirem.

export const EVENT_STATUS = {
  AGUARDANDO_PREENCHIMENTO: 'Aguardando preenchimento',
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
  CONFIRMADO: 'Confirmado',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
} as const satisfies Record<string, EventStatus>;

// Ordem canônica para chips de filtro/badges.
export const ALL_EVENT_STATUSES: EventStatus[] = [
  EVENT_STATUS.AGUARDANDO_PREENCHIMENTO,
  EVENT_STATUS.AGUARDANDO_CONFIRMACAO,
  EVENT_STATUS.CONFIRMADO,
  EVENT_STATUS.FINALIZADO,
  EVENT_STATUS.CANCELADO,
];

// Opções oferecidas no formulário interno (o rascunho de link nunca é escolhido
// à mão — ele nasce só via POST /api/quote-links).
export const INTERNAL_FORM_STATUSES: EventStatus[] = [
  EVENT_STATUS.AGUARDANDO_CONFIRMACAO,
  EVENT_STATUS.CONFIRMADO,
  EVENT_STATUS.FINALIZADO,
];

// Aceita entrada frouxa (status/data podem vir null/undefined de várias fontes:
// Prisma, payload público, estado do formulário). effectiveStatus normaliza.
type StatusInput = { status?: string | null; event_date?: string | null };

// O fim do dia do evento (fuso America/Sao_Paulo, fixo -03:00 desde 2019, sem
// horário de verão) já passou? Compara instantes — independe do fuso do servidor.
function eventDayIsPast(event_date?: string | null): boolean {
  if (!event_date) return false;
  const day = String(event_date).slice(0, 10); // 'YYYY-MM-DD'
  const endOfDay = new Date(`${day}T23:59:59-03:00`);
  if (Number.isNaN(endOfDay.getTime())) return false;
  return Date.now() > endOfDay.getTime();
}

// Status EFETIVO: um evento "Confirmado" cuja data já venceu é lido como
// "Finalizado" (finalização automática, derivada na leitura — não há job/cron).
// Cancelado e os demais nunca finalizam sozinhos.
export function effectiveStatus(event: StatusInput): EventStatus {
  const s = (event.status || EVENT_STATUS.AGUARDANDO_PREENCHIMENTO) as EventStatus;
  if (s === EVENT_STATUS.CONFIRMADO && eventDayIsPast(event.event_date)) {
    return EVENT_STATUS.FINALIZADO;
  }
  return s;
}

// Rascunho de link ainda não enviado pela cliente (sem data, fora de contagens).
export function isDraftLink(event: StatusInput): boolean {
  return effectiveStatus(event) === EVENT_STATUS.AGUARDANDO_PREENCHIMENTO;
}

// Conta como receita/venda no Dashboard.
export function countsAsRevenue(event: StatusInput): boolean {
  const s = effectiveStatus(event);
  return s === EVENT_STATUS.CONFIRMADO || s === EVENT_STATUS.FINALIZADO;
}

// Aparece no Calendário (tem data e é um evento ativo — nem rascunho nem cancelado).
export function showsInCalendar(event: StatusInput): boolean {
  const s = effectiveStatus(event);
  return s !== EVENT_STATUS.AGUARDANDO_PREENCHIMENTO && s !== EVENT_STATUS.CANCELADO;
}

// Estoque: "Confirmado" bloqueia (reserva firme); "Aguardando confirmação" é
// reserva temporária (warning). Cancelado/rascunho/finalizado não seguram nada.
export function blocksStock(event: StatusInput): boolean {
  return effectiveStatus(event) === EVENT_STATUS.CONFIRMADO;
}
export function reservesStock(event: StatusInput): boolean {
  return effectiveStatus(event) === EVENT_STATUS.AGUARDANDO_CONFIRMACAO;
}

// A cliente ainda pode preencher/editar o link? Só enquanto for rascunho.
export function isLinkOpenForClient(status?: string | null): boolean {
  return (status || '') === EVENT_STATUS.AGUARDANDO_PREENCHIMENTO;
}

// Badge visual (variante do componente Badge + rótulo).
export function statusBadge(status: EventStatus): {
  variant: 'success' | 'warning' | 'danger' | 'neutral';
  label: EventStatus;
} {
  switch (status) {
    case EVENT_STATUS.CONFIRMADO:
      return { variant: 'success', label: status };
    case EVENT_STATUS.AGUARDANDO_CONFIRMACAO:
      return { variant: 'warning', label: status };
    case EVENT_STATUS.CANCELADO:
      return { variant: 'danger', label: status };
    default: // Aguardando preenchimento / Finalizado
      return { variant: 'neutral', label: status };
  }
}
