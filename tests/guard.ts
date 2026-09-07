// GUARDA CONTRA ENGANO: o harness cria/derruba contas e escreve no banco. Rodar
// contra PRODUÇÃO por acidente é o tipo de erro que só acontece uma vez, mas é
// caro. Esta checagem ABORTA todos os testes se o alvo não for o banco de TESTE.
//
// Duas travas:
//   1) blocklist do ref de PRODUÇÃO (nunca roda lá, aconteça o que acontecer);
//   2) opt-in explícito HARNESS_ALLOW_TEST_DB=true (um `npm test` cru, com o
//      .env de produção, aborta em vez de sair criando conta na prod).

const PROD_REF = 'urvbkfyyvbsahdnkkwed'; // projeto de PRODUÇÃO — proibido aqui
const TEST_REF = 'tjxmpnvwikgicxgouwdj'; // projeto de TESTE — o ÚNICO permitido

// Trava para operações DESTRUTIVAS que apagam dados feitos para sobreviver à
// exclusão de conta — hoje, beneficios_consumidos. A guarda geral acima é uma
// BLOCKLIST (nega produção); esta é uma ALLOWLIST (só permite o ref de teste,
// nomeado). A diferença importa: um projeto novo, desconhecido das duas listas,
// passa na blocklist e é barrado aqui. Não basta "não ser produção" — tem de ser
// exatamente o banco de teste.
export function assertBancoDeTesteParaApagar(operacao: string) {
  const alvo = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''} ${process.env.DATABASE_URL || ''}`;
  if (process.env.HARNESS_ALLOW_TEST_DB !== 'true') {
    throw new Error(`🛑 ${operacao} ABORTADO: HARNESS_ALLOW_TEST_DB não é "true".`);
  }
  if (alvo.includes(PROD_REF)) {
    throw new Error(`🛑 ${operacao} ABORTADO: o alvo é o banco de PRODUÇÃO.`);
  }
  if (!alvo.includes(TEST_REF)) {
    throw new Error(
      `🛑 ${operacao} ABORTADO: o alvo não é o banco de TESTE (${TEST_REF}). ` +
      'Esta tabela existe para sobreviver à exclusão de conta; apagá-la no banco errado ' +
      'devolveria mês grátis a quem já usou, sem deixar rastro.'
    );
  }
}

export function assertTestDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const db = process.env.DATABASE_URL || '';
  const haystack = `${url} ${db}`;

  if (!url) {
    throw new Error('🛑 Harness abortado: NEXT_PUBLIC_SUPABASE_URL vazio. Configure o projeto Supabase de TESTE.');
  }
  if (haystack.includes(PROD_REF)) {
    throw new Error(
      '🛑 HARNESS ABORTADO: o alvo é o banco de PRODUÇÃO. O harness só roda contra o projeto Supabase de TESTE — ' +
      'aponte NEXT_PUBLIC_SUPABASE_URL/DATABASE_URL para o projeto de teste.'
    );
  }
  if (process.env.HARNESS_ALLOW_TEST_DB !== 'true') {
    throw new Error(
      '🛑 Harness abortado: defina HARNESS_ALLOW_TEST_DB=true (apenas no ambiente de TESTE) para confirmar que o ' +
      'banco alvo é o de teste. Isso evita rodar contra produção por engano com o .env local.'
    );
  }
}
