// GUARDA CONTRA ENGANO: o harness cria/derruba contas e escreve no banco. Rodar
// contra PRODUÇÃO por acidente é o tipo de erro que só acontece uma vez, mas é
// caro. Esta checagem ABORTA todos os testes se o alvo não for o banco de TESTE.
//
// Duas travas:
//   1) blocklist do ref de PRODUÇÃO (nunca roda lá, aconteça o que acontecer);
//   2) opt-in explícito HARNESS_ALLOW_TEST_DB=true (um `npm test` cru, com o
//      .env de produção, aborta em vez de sair criando conta na prod).

const PROD_REF = 'urvbkfyyvbsahdnkkwed'; // projeto de PRODUÇÃO — proibido aqui

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
