import { createHmac, timingSafeEqual } from 'crypto';

// Validação da assinatura do webhook do Mercado Pago — funções PURAS, sem segredo
// dentro (ele entra por parâmetro) e sem 'server-only', para serem testáveis.
//
// Sem isto, qualquer um que descubra a URL libera acesso pago mandando um POST.
// É a única coisa que separa "o MP disse" de "alguém disse".

/** `ts=1704908010,v1=618c8534...` */
export type PartesAssinatura = { ts: string; v1: string };

export function extrairAssinatura(header: string | null): PartesAssinatura | null {
  if (!header) return null;
  const partes: Record<string, string> = {};
  for (const pedaco of header.split(',')) {
    const i = pedaco.indexOf('=');
    if (i <= 0) continue;
    partes[pedaco.slice(0, i).trim()] = pedaco.slice(i + 1).trim();
  }
  if (!partes.ts || !partes.v1) return null;
  return { ts: partes.ts, v1: partes.v1 };
}

/**
 * O manifesto assinado pelo MP. A ordem e os separadores são exatos — inclusive o
 * ponto-e-vírgula final. Qualquer desvio muda o hash e derruba toda notificação.
 */
export function montarManifesto(dataId: string, requestId: string, ts: string): string {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

/** Comparação em tempo constante: comparar hash com === vaza informação por tempo. */
export function hashConfere(esperado: string, recebido: string): boolean {
  const a = Buffer.from(esperado, 'hex');
  const b = Buffer.from(recebido, 'hex');
  // timingSafeEqual exige mesmo tamanho; tamanho diferente já é reprovação.
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function calcularHash(manifesto: string, segredo: string): string {
  return createHmac('sha256', segredo).update(manifesto, 'utf8').digest('hex');
}

export type ResultadoValidacao =
  | { valido: true; manifesto: string }
  | { valido: false; motivo: 'sem_header' | 'sem_segredo' | 'sem_data_id' | 'ts_invalido' | 'expirado' | 'hash_diferente' };

/** Janela anti-replay. Uma notificação legítima chega em segundos, não em horas. */
export const JANELA_SEGUNDOS = 300;

export function validarAssinatura(entrada: {
  header: string | null;
  requestId: string | null;
  dataId: string | null;
  segredo: string | undefined;
  agora: Date;
}): ResultadoValidacao {
  const { header, requestId, dataId, segredo, agora } = entrada;

  if (!segredo) return { valido: false, motivo: 'sem_segredo' };
  if (!dataId) return { valido: false, motivo: 'sem_data_id' };
  const partes = extrairAssinatura(header);
  if (!partes) return { valido: false, motivo: 'sem_header' };

  const tsNumero = Number(partes.ts);
  if (!Number.isFinite(tsNumero) || tsNumero <= 0) return { valido: false, motivo: 'ts_invalido' };

  // O MP manda ts em milissegundos em algumas integrações e em segundos noutras.
  // Normaliza pelo tamanho: 13 dígitos é ms.
  const tsMs = partes.ts.length >= 13 ? tsNumero : tsNumero * 1000;
  const diferenca = Math.abs(agora.getTime() - tsMs) / 1000;
  if (diferenca > JANELA_SEGUNDOS) return { valido: false, motivo: 'expirado' };

  const manifesto = montarManifesto(dataId, requestId ?? '', partes.ts);
  if (!hashConfere(calcularHash(manifesto, segredo), partes.v1)) {
    return { valido: false, motivo: 'hash_diferente' };
  }
  return { valido: true, manifesto };
}

// ---------------------------------------------------------------------------

export type TipoEvento =
  | 'subscription_preapproval'
  | 'subscription_authorized_payment'
  | 'subscription_preapproval_plan'
  | 'payment'
  | 'desconhecido';

export type CorpoWebhook = {
  id?: number | string;
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
};

export function tipoDoEvento(corpo: CorpoWebhook): TipoEvento {
  const bruto = corpo.type || corpo.topic || '';
  const conhecidos: TipoEvento[] = [
    'subscription_preapproval',
    'subscription_authorized_payment',
    'subscription_preapproval_plan',
    'payment',
  ];
  return (conhecidos as string[]).includes(bruto) ? (bruto as TipoEvento) : 'desconhecido';
}

/**
 * Chave de idempotência. O MP reenvia a MESMA notificação a cada 15 minutos até
 * receber 200 — e o id dela é estável. Quando ele falta (corpo fora do padrão),
 * cai para tipo+recurso+ação, que é estável o bastante para a retentativa.
 */
export function chaveDoEvento(corpo: CorpoWebhook): string {
  if (corpo.id !== undefined && corpo.id !== null && String(corpo.id).length > 0) return String(corpo.id);
  const tipo = corpo.type || corpo.topic || 'sem_tipo';
  const recurso = corpo.data?.id ?? 'sem_recurso';
  const acao = corpo.action ?? 'sem_acao';
  return `derivada:${tipo}:${recurso}:${acao}`;
}
