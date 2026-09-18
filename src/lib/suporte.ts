// Conteúdo e limites da aba Suporte, em UM lugar só.
//
// Fica fora do componente de propósito: a rota de API precisa da MESMA lista de
// assuntos e do MESMO teto de caracteres para validar. Duplicar isso nos dois
// lados é como a validação do servidor começa a divergir da tela.

/** Teto do campo de opinião. A tela conta e o servidor recusa acima disso. */
export const LIMITE_MENSAGEM = 1000;

/** E-mail oficial de suporte — o que a decoradora copia e para onde o mailto vai. */
export const EMAIL_SUPORTE = 'sbgestor2@gmail.com';

export const TIPOS_FEEDBACK = ['avaliacao', 'opiniao', 'ia_interesse'] as const;
export type TipoFeedback = (typeof TIPOS_FEEDBACK)[number];

/** Chips de assunto rápido: lista FECHADA (o servidor descarta o que não está aqui). */
export const ASSUNTOS_SUPORTE = [
  'Acervo de Peças',
  'Modelo de Proposta',
  'Frete e Logística',
  'Controle de Aluguel',
] as const;

/**
 * As cinco carinhas. `nota` é o que vai para o banco (1..5) — o rótulo pode ser
 * reescrito sem invalidar o histórico já gravado.
 */
export const CARINHAS = [
  { nota: 1, emoji: '😖', rotulo: 'Péssimo' },
  { nota: 2, emoji: '🙁', rotulo: 'Ruim' },
  { nota: 3, emoji: '😐', rotulo: 'Regular' },
  { nota: 4, emoji: '🙂', rotulo: 'Muito Bom' },
  { nota: 5, emoji: '🤩', rotulo: 'Incrível' },
] as const;

export function rotuloDaNota(nota: number | null | undefined): string | null {
  return CARINHAS.find((c) => c.nota === nota)?.rotulo ?? null;
}

// ---------------------------------------------------------------------------
// PERGUNTAS FREQUENTES
//
// ⚠️ AS RESPOSTAS AINDA NÃO EXISTEM. O print de referência mostra o acordeão
// fechado, então o texto certo nunca foi escrito — e inventar resposta de
// suporte é pior do que não ter: a decoradora seguiria um passo a passo falso
// e concluiria que o sistema está quebrado.
//
// PARA PREENCHER: troque `resposta: null` pelo texto. Quem tem resposta abre
// normalmente; quem ainda está com `null` mostra o aviso de "resposta em breve"
// e não finge que respondeu. Nada mais precisa mudar.
// ---------------------------------------------------------------------------
export type PerguntaFrequente = { id: string; pergunta: string; resposta: string | null };

export const FAQ_SUPORTE: PerguntaFrequente[] = [
  { id: 'duplicar-orcamento', pergunta: 'Como duplicar um orçamento de festa?', resposta: null },
  { id: 'bloquear-manutencao', pergunta: 'Como bloquear peças para manutenção?', resposta: null },
  { id: 'paleta-de-cores', pergunta: 'Como enviar uma proposta com minha paleta de cores?', resposta: null },
];
