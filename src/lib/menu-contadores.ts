import type { InventoryItem, ChatMessage } from '@/types';

// ============================================================================
// OS NÚMEROS DA BARRA LATERAL — sempre dado real, nunca valor fixo.
//
// Módulo puro: sem React, sem fetch. É a regra de contagem, e precisa ser a
// MESMA que a tela correspondente mostra — por isso o Acervo usa totalDePecas
// também. Se a barra dissesse "184 peças" e o Acervo "Total de Peças: 182",
// a decoradora não saberia em qual confiar.
// ============================================================================

/** Soma do estoque — exatamente o "Total de Peças" do Acervo. */
export function totalDePecas(itens: Pick<InventoryItem, 'stock_quantity'>[]): number {
  return itens.reduce((soma, item) => soma + (Number(item.stock_quantity) || 0), 0);
}

export function rotuloDePecas(n: number): string {
  return n === 1 ? '1 peça' : `${n.toLocaleString('pt-BR')} peças`;
}

export function rotuloDeNaoLidas(n: number): string {
  return n === 1 ? '1 mensagem não lida' : `${n} mensagens não lidas`;
}

/** Contador visual compacto: acima de 9 vira "9+", para não alargar a linha. */
export function formatarContador(n: number): string {
  return n > 9 ? '9+' : String(n);
}

/**
 * Mensagens RECEBIDAS depois da última visita ao Chat.
 *
 * O banco não registra leitura — não existe esse campo. "Não lida" aqui é
 * "chegou depois da última vez que ela abriu o Chat", guardado no navegador:
 * o mesmo mecanismo que o sininho do cabeçalho já usa. Vale por aparelho.
 *
 * Sem visita registrada (`vistoEm` nulo) devolve 0: sem referência não há
 * como dizer o que é novo, e mostrar o histórico inteiro como "não lido" no
 * primeiro dia seria um número falso.
 */
export function contarNaoLidas(
  mensagens: Pick<ChatMessage, 'sender_id' | 'receiver_id' | 'created_at'>[],
  meuId: string | null | undefined,
  vistoEm: number | null,
): number {
  if (!meuId || vistoEm === null) return 0;
  return mensagens.filter(
    (m) => m.receiver_id === meuId && m.sender_id !== meuId && Date.parse(m.created_at) > vistoEm,
  ).length;
}
