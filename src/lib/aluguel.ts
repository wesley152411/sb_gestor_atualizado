// LINK DE ALUGUEL — regras compartilhadas entre a tela que gera o link, a rota
// que o cria, a página pública da cliente, o Calendário e o Acervo.
//
// FUSO: o sistema inteiro trata data e hora no horário de Brasília (-03:00 fixo,
// sem horário de verão), o mesmo critério da finalização automática do evento.
// O campo datetime-local do navegador não tem fuso nenhum — é aqui que ele é
// colado, num lugar só, para a tela e o servidor nunca discordarem.

export const TIPO_LINK = { DECORACAO: 'decoracao', ALUGUEL: 'aluguel' } as const;
export type TipoLink = (typeof TIPO_LINK)[keyof typeof TIPO_LINK];

const FUSO_BR = '-03:00';
const ZONA_BR = 'America/Sao_Paulo';

export function ehTipoLink(valor: unknown): valor is TipoLink {
  return valor === TIPO_LINK.DECORACAO || valor === TIPO_LINK.ALUGUEL;
}

/** 'YYYY-MM-DDTHH:mm' (input datetime-local) -> instante no fuso de Brasília. */
export function instanteDoCampo(valor?: string | null): Date | null {
  if (!valor) return null;
  const texto = String(valor).slice(0, 16);
  if (texto.length < 16) return null;
  const d = new Date(`${texto}:00${FUSO_BR}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const partesBR = (d: Date) => {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_BR, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
};

/** Instante -> 'YYYY-MM-DDTHH:mm' para preencher o input datetime-local. */
export function campoDoInstante(iso?: string | Date | null): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = partesBR(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Instante -> '16/09/2026 às 14:00' (o que a cliente lê). */
export function formatarDataHora(iso?: string | Date | null): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = partesBR(d);
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

/** O dia (YYYY-MM-DD, horário de Brasília) de um instante — chave do Calendário. */
export function diaDoInstante(iso?: string | Date | null): string {
  const campo = campoDoInstante(iso);
  return campo ? campo.slice(0, 10) : '';
}

/**
 * Período do aluguel. Devolve a mensagem do problema, ou '' quando está válido.
 * As MESMAS regras do CHECK party_events_aluguel_periodo no banco, mais a do
 * passado — que é de produto, não de integridade: o banco aceita, mas gerar um
 * link para retirar ontem é erro de digitação.
 */
export function validarPeriodo(retirada: Date | null, devolucao: Date | null, agora: Date = new Date()): string {
  if (!retirada || !devolucao) return 'Informe a data e a hora da retirada e da devolução.';
  if (devolucao.getTime() <= retirada.getTime()) return 'A devolução tem de ser depois da retirada.';
  // Compara por DIA: retirar hoje mais cedo não é passado, retirar ontem é.
  if (diaDoInstante(retirada) < diaDoInstante(agora)) return 'A retirada não pode ser numa data passada.';
  return '';
}

type EventoComPeriodo = { tipo_link?: string | null; retirada_em?: string | Date | null; devolucao_em?: string | Date | null };

/** O intervalo em que a peça fica FORA por causa de um aluguel. null = não é aluguel. */
export function periodoDoAluguel(evento: EventoComPeriodo): { inicio: Date; fim: Date } | null {
  if (evento?.tipo_link !== TIPO_LINK.ALUGUEL) return null;
  const inicio = evento.retirada_em ? new Date(evento.retirada_em) : null;
  const fim = evento.devolucao_em ? new Date(evento.devolucao_em) : null;
  if (!inicio || !fim || Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
  return { inicio, fim };
}
