import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 90000,
    fileParallelism: false, // uma conta de teste por vez, sem corrida
  },
});
