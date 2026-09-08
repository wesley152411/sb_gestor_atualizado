// ============================================================================
// ENDEREÇO: a regra de TUDO OU NADA entre o formato novo e o antigo.
//
// O problema que isto resolve: a coluna `address` de texto livre continua
// existindo, e os 20 eventos gravados antes da estruturação só têm ela. Se a
// tela montasse o endereço "com o que tiver", uma linha meio preenchida sairia
// assim:
//
//     Rua Ceará, — — Vespasiano/ — CEP —
//
// que parece dado perdido. O texto antigo, por mais bagunçado que seja, é ao
// menos um pensamento completo: "Av Paulista 407 Celvia - Vespasiano".
//
// Por isso: o formato estruturado só é usado quando os SEIS campos obrigatórios
// estão presentes. Faltando qualquer um, cai inteiro no `address`. Nunca metade
// de um, metade do outro.
//
// Módulo puro de propósito: é regra de exibição, usada pelas telas E pelo PDF,
// e precisa ser exercitável sem navegador nem banco.
// ============================================================================

/** Complemento fica FORA: é o único opcional de verdade num endereço brasileiro. */
export const CAMPOS_OBRIGATORIOS = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'] as const;

export type CampoEndereco = (typeof CAMPOS_OBRIGATORIOS)[number];

export type FonteEndereco = {
  address?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
};

const limpo = (v?: string | null) => (typeof v === 'string' ? v.trim() : '');

/** Os seis obrigatórios estão preenchidos? É o que autoriza usar o formato novo. */
export function estruturadoCompleto(fonte: FonteEndereco | null | undefined): boolean {
  if (!fonte) return false;
  return CAMPOS_OBRIGATORIOS.every((campo) => limpo(fonte[campo]) !== '');
}

/** Quais obrigatórios faltam — usado pela validação do formulário. */
export function camposFaltando(fonte: FonteEndereco): CampoEndereco[] {
  return CAMPOS_OBRIGATORIOS.filter((campo) => limpo(fonte[campo]) === '');
}

export const ROTULO: Record<CampoEndereco | 'complemento', string> = {
  cep: 'CEP',
  logradouro: 'Rua',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  estado: 'Estado',
};

/**
 * O endereço em LINHAS, já decidido entre novo e antigo.
 * Devolve [] quando não há endereço nenhum — quem chama decide o traço.
 */
export function enderecoEmLinhas(fonte: FonteEndereco | null | undefined): string[] {
  if (!fonte) return [];
  if (estruturadoCompleto(fonte)) {
    const rua = [limpo(fonte.logradouro), limpo(fonte.numero)].filter(Boolean).join(', ');
    const primeira = limpo(fonte.complemento) ? `${rua} — ${limpo(fonte.complemento)}` : rua;
    return [
      primeira,
      `${limpo(fonte.bairro)} — ${limpo(fonte.cidade)}/${limpo(fonte.estado).toUpperCase()}`,
      `CEP ${limpo(fonte.cep)}`,
    ];
  }
  const antigo = limpo(fonte.address);
  return antigo ? [antigo] : [];
}

/** Uma linha só, para tabela e cabeçalho. */
export function formatarEndereco(fonte: FonteEndereco | null | undefined, vazio = '—'): string {
  const linhas = enderecoEmLinhas(fonte);
  return linhas.length ? linhas.join(' — ') : vazio;
}

// ---------------------------------------------------------------------------
// CEP
// ---------------------------------------------------------------------------

/** Máscara 00000-000. Aceita digitação parcial: usada a cada tecla. */
export function mascararCep(valor: string): string {
  const digitos = (valor || '').replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 5) return digitos;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

/** O CHECK do banco exige exatamente este formato — a tela valida o mesmo. */
export function cepValido(valor?: string | null): boolean {
  return /^[0-9]{5}-[0-9]{3}$/.test(limpo(valor));
}

export function ufValida(valor?: string | null): boolean {
  return /^[A-Z]{2}$/.test(limpo(valor).toUpperCase());
}

export type EnderecoDoCep = { logradouro: string; bairro: string; cidade: string; estado: string };

/**
 * Busca no ViaCEP. Devolve null em qualquer problema — CEP não encontrado, rede
 * fora, resposta estranha.
 *
 * NUNCA bloqueia o envio: a base pública erra, CEP de rua inteira não traz
 * número e alguns CEPs genéricos não trazem bairro. Isto PREENCHE, e quem manda
 * é sempre o que a decoradora deixar nos campos.
 */
export async function buscarCep(cep: string, buscar: typeof fetch = fetch): Promise<EnderecoDoCep | null> {
  const digitos = (cep || '').replace(/\D/g, '');
  if (digitos.length !== 8) return null;
  try {
    const resposta = await buscar(`https://viacep.com.br/ws/${digitos}/json/`);
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as Record<string, unknown>;
    if (dados?.erro) return null;
    return {
      logradouro: String(dados.logradouro ?? ''),
      bairro: String(dados.bairro ?? ''),
      cidade: String(dados.localidade ?? ''),
      estado: String(dados.uf ?? '').toUpperCase(),
    };
  } catch {
    return null;
  }
}
