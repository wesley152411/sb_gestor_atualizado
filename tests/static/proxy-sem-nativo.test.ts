import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// POR QUE ESTE TESTE EXISTE
// O adapter da Netlify compila src/proxy.ts como Edge Function (Deno). Binário
// nativo não roda lá. Quando o gate de aceite legal foi posto no proxy, ele
// arrastou o Prisma junto: `tsc` passou, `next build` local passou, e a Netlify
// quebrou no EMPACOTAMENTO — "Usage of unsupported C++ Addon(s) found in Node.js
// Middleware: .prisma/client/libquery_engine-*.so.node". Produção ficou sem o
// deploy. Este teste percorre o grafo de imports do proxy e falha ANTES disso.

const RAIZ = process.cwd();

// Pacotes que simplesmente não existem no runtime de borda.
const PROIBIDOS = ['@prisma/client', 'fs', 'node:fs', 'fs/promises', 'node:fs/promises'];
// Sentinela: qualquer módulo nosso marcado como exclusivo de servidor.
const MARCADOR_SERVIDOR = "'server-only'";

function resolver(spec: string, deQual: string): string | null {
  const base = spec.startsWith('@/')
    ? path.join(RAIZ, 'src', spec.slice(2))
    : spec.startsWith('.')
      ? path.resolve(path.dirname(deQual), spec)
      : null;
  if (!base) return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(cand) && !cand.endsWith(path.sep)) {
      try { if (readFileSync(cand, 'utf8') !== undefined) return cand; } catch { /* diretório */ }
    }
  }
  return null;
}

function importsDe(src: string): string[] {
  return [...src.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function grafo(entrada: string) {
  const vistos = new Set<string>();
  const externos = new Set<string>();
  const fila = [entrada];
  while (fila.length) {
    const atual = fila.pop()!;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    for (const spec of importsDe(readFileSync(atual, 'utf8'))) {
      const alvo = resolver(spec, atual);
      if (alvo) fila.push(alvo);
      else externos.add(spec);
    }
  }
  return { vistos, externos };
}

describe('src/proxy.ts roda no Edge da Netlify', () => {
  const { vistos, externos } = grafo(path.join(RAIZ, 'src', 'proxy.ts'));

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
