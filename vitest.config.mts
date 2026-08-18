import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 90000, // folga p/ criação de conta quando o Supabase throttle o auth
    hookTimeout: 120000,
    fileParallelism: false, // uma conta de teste por vez, sem corrida
  },
});
