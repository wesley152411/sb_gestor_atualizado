import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mesmo alias do app, para os testes poderem importar módulos puros por '@/'.
    alias: { '@': new URL('./src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/static/**'], // provas estáticas: vitest.static.config.mts
    setupFiles: ['tests/setup.ts'], // guarda: aborta se o alvo não for o banco de TESTE
    testTimeout: 90000, // folga p/ criação de conta quando o Supabase throttle o auth
    hookTimeout: 120000,
    fileParallelism: false, // uma conta de teste por vez, sem corrida
  },
});
