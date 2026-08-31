import { defineConfig } from 'vitest/config';
import path from 'path';

// Provas ESTÁTICAS: leem o código-fonte (e exercitam funções puras), sem subir
// servidor nem tocar banco. Config separada de propósito — o setup do harness
// aborta sem o banco de TESTE, e estas provas precisam rodar em QUALQUER job.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/static/**/*.test.ts'],
  },
});
