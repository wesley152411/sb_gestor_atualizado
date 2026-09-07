import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ, grafoDe } from './grafo';

// POR QUE ESTE TESTE EXISTE
// O adapter da Netlify compila src/proxy.ts como Edge Function (Deno). Binário
// nativo não roda lá. Quando o gate de aceite legal foi posto no proxy, ele
// arrastou o Prisma junto: `tsc` passou, `next build` local passou, e a Netlify
// quebrou no EMPACOTAMENTO — "Usage of unsupported C++ Addon(s) found in Node.js
// Middleware: .prisma/client/libquery_engine-*.so.node". Produção ficou sem o
// deploy. Este teste percorre o grafo de imports do proxy e falha ANTES disso.

// Pacotes que simplesmente não existem no runtime de borda.
const PROIBIDOS = ['@prisma/client', 'fs', 'node:fs', 'fs/promises', 'node:fs/promises'];
// Sentinela: qualquer módulo nosso marcado como exclusivo de servidor.
const MARCADOR_SERVIDOR = "'server-only'";

describe('src/proxy.ts roda no Edge da Netlify', () => {
  const { vistos, externos } = grafoDe(path.join(RAIZ, 'src', 'proxy.ts'));

  it('não alcança nenhum pacote indisponível no runtime de borda', () => {
    const achados = PROIBIDOS.filter((p) => externos.has(p));
    expect(achados, `proxy.ts importa (transitivamente) ${achados.join(', ')} — o build da Netlify quebra no empacotamento`).toEqual([]);
  });

  it("não alcança nenhum módulo marcado com 'server-only'", () => {
    const culpados = [...vistos]
      .filter((f) => readFileSync(f, 'utf8').includes(MARCADOR_SERVIDOR))
      .map((f) => path.relative(RAIZ, f));
    expect(culpados, `proxy.ts alcança módulo(s) só-servidor: ${culpados.join(', ')}`).toEqual([]);
  });

  it('o grafo é pequeno o bastante para caber num Edge Function', () => {
    // Se isto disparar, alguém pendurou meio app no proxy — revise antes de subir.
    expect(vistos.size).toBeLessThan(15);
  });
});
