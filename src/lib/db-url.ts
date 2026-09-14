// ============================================================================
// A URL DO BANCO, CORRIGIDA ANTES DE CHEGAR AO PRISMA.
//
// O incidente que isto fecha: a DATABASE_URL da Netlify foi trocada e perdeu o
// parâmetro `pgbouncer=true`. A porta 6543 do Supabase é o pooler em MODO
// TRANSAÇÃO — ele devolve a conexão ao fim de cada transação e a entrega a outra
// requisição. O Prisma, sem o parâmetro, cria "prepared statements" com nome
// (s0, s1, s2...) que ficam presos na conexão; a requisição seguinte tenta criar
// o mesmo nome e o Postgres recusa:
//
//     prepared statement "s6" already exists   (42P05)
//
// Resultado: TODA rota que lê o banco caiu, inclusive login e aceite legal.
//
// A variável foi corrigida no painel duas vezes e o erro seguiu — o valor não
// chegou à função por um detalhe de contexto ou escopo que daqui não se vê. Uma
// configuração que derruba o sistema inteiro não pode depender de ser colada
// perfeitamente num painel. Então o código garante o parâmetro, e AVISA no log
// quando precisou garantir, para a variável ser consertada de verdade.
//
// Módulo puro: sem Prisma, sem process.env lido aqui — testável sem banco.
// ============================================================================

/** Porta do pooler de TRANSAÇÃO do Supabase. A 5432 (sessão) não precisa. */
export const PORTA_POOLER_TRANSACAO = '6543';

export type AjusteDaUrl = {
  url: string;
  ajustada: boolean;
  /** Texto para o log. NUNCA contém a senha. */
  motivo?: string;
};

/**
 * Garante `pgbouncer=true` quando a URL usa o pooler de transação.
 *
 * A edição é por TEXTO, não por `new URL(...).toString()`: regravar a URL
 * inteira pode re-codificar a senha, e senha com caractere especial é
 * exatamente o que esta URL tem. Aqui só se mexe no trecho de parâmetros.
 */
export function ajustarUrlDoBanco(bruta: string | undefined | null): AjusteDaUrl {
  if (!bruta) return { url: bruta ?? '', ajustada: false };

  let analisada: URL;
  try {
    analisada = new URL(bruta);
  } catch {
    // URL que nem parseia não é assunto deste ajuste: o Prisma vai reclamar
    // com a mensagem dele, que é a certa para esse caso.
    return { url: bruta, ajustada: false };
  }

  if (analisada.port !== PORTA_POOLER_TRANSACAO) return { url: bruta, ajustada: false };

  const atual = analisada.searchParams.get('pgbouncer');
  if (atual === 'true') return { url: bruta, ajustada: false };

  // Separa um eventual fragmento (#...) para o parâmetro entrar antes dele.
  const iFrag = bruta.indexOf('#');
  const base = iFrag === -1 ? bruta : bruta.slice(0, iFrag);
  const frag = iFrag === -1 ? '' : bruta.slice(iFrag);

  let nova: string;
  if (atual !== null) {
    // Existe com outro valor (ex.: pgbouncer=false): troca só o valor.
    nova = base.replace(/([?&])pgbouncer=[^&#]*/, '$1pgbouncer=true') + frag;
  } else {
    nova = base + (base.includes('?') ? '&' : '?') + 'pgbouncer=true' + frag;
  }

  return {
    url: nova,
    ajustada: true,
    motivo:
      `DATABASE_URL usa a porta ${PORTA_POOLER_TRANSACAO} (pooler de transação) ` +
      (atual === null ? 'sem pgbouncer=true' : `com pgbouncer=${atual}`) +
      ' — parâmetro garantido pelo código. Corrija a variável de ambiente: ' +
      `${descreverSemSenha(bruta)}`,
  };
}

/** host:porta/banco + nomes dos parâmetros — para log. Sem usuário, sem senha. */
export function descreverSemSenha(bruta: string): string {
  try {
    const u = new URL(bruta);
    const params = [...u.searchParams.keys()];
    return `${u.hostname}:${u.port}${u.pathname}${params.length ? ` (params: ${params.join(', ')})` : ' (sem params)'}`;
  } catch {
    return '(URL não parseável)';
  }
}
