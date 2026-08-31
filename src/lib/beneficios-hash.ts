import { createHmac } from 'crypto';

// Âncoras de benefício (teste grátis / oferta de retenção). Guardamos HMAC, nunca
// o valor em claro — e com PEPPER secreto, não sal público: o espaço de CNPJs
// válidos é enumerável (~10¹²), então um SHA-256 puro seria reversível por força
// bruta em tempo trivial. O pepper vive em variável de ambiente e NUNCA no banco;
// vazar o dump não pode revelar quem usou o teste.
//
// Funções puras, sem 'server-only': o pepper entra por parâmetro para que isto
// seja testável e para que nenhum segredo fique capturado no módulo.

export type AncoraTipo = 'cnpj' | 'mp_payer';
export type Beneficio = 'teste_gratis' | 'oferta_retencao';

/** CNPJ só como dígitos: máscara não pode gerar duas âncoras para a mesma empresa. */
export function normalizarCnpj(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function ancoraValida(tipo: AncoraTipo, valor: string): boolean {
  if (tipo === 'cnpj') return normalizarCnpj(valor).length === 14;
  return valor.trim().length > 0;
}

/**
 * Hash da âncora. O tipo entra no material assinado para que o mesmo dígito nunca
 * colida entre um CNPJ e um id de pagador.
 */
export function hashAncora(tipo: AncoraTipo, valor: string, pepper: string): string {
  if (!pepper) throw new Error('BENEFICIOS_PEPPER ausente: sem pepper o hash da âncora é reversível.');
  const normalizado = tipo === 'cnpj' ? normalizarCnpj(valor) : valor.trim();
  return createHmac('sha256', pepper).update(`${tipo}:${normalizado}`, 'utf8').digest('hex');
}
