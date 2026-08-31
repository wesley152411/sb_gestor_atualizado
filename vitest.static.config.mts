import { defineConfig } from 'vitest/config';

// Provas ESTÁTICAS: leem o código-fonte, não sobem servidor nem tocam banco.
// Config separada de propósito — o setup do harness aborta sem o banco de TESTE,
// e estas provas precisam rodar em QUALQUER job, inclusive no do build.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/static/**/*.test.ts'],
  },
});
