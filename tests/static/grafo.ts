import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import path from 'path';

// Caminhador do grafo de imports. Compartilhado pelas provas estáticas: a do
// proxy (nada de nativo no Edge) e a das chaves do Mercado Pago (segredo não
// alcança componente cliente). É análise de TEXTO, não execução — de propósito:
// importar os módulos de verdade traria 'server-only' e efeito colateral junto.

export const RAIZ = process.cwd();

export function resolverImport(spec: string, deQual: string): string | null {
  const base = spec.startsWith('@/')
    ? path.join(RAIZ, 'src', spec.slice(2))
    : spec.startsWith('.')
      ? path.resolve(path.dirname(deQual), spec)
      : null;
  if (!base) return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

export function importsDe(fonte: string): string[] {
  return [...fonte.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

export type Grafo = { vistos: Set<string>; externos: Set<string> };

export function grafoDe(entrada: string): Grafo {
  const vistos = new Set<string>();
  const externos = new Set<string>();
  const fila = [entrada];
  while (fila.length) {
    const atual = fila.pop()!;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    for (const spec of importsDe(readFileSync(atual, 'utf8'))) {
      const alvo = resolverImport(spec, atual);
      if (alvo) fila.push(alvo);
      else externos.add(spec);
    }
  }
  return { vistos, externos };
}

/** Todos os arquivos .ts/.tsx sob um diretório. */
export function fontesEm(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nome) => {
    const alvo = path.join(dir, nome);
    if (statSync(alvo).isDirectory()) return fontesEm(alvo);
    return /\.(ts|tsx)$/.test(nome) ? [alvo] : [];
  });
}

/** Arquivos marcados com 'use client' — a fronteira do que vai para o navegador. */
export function componentesCliente(): string[] {
  return fontesEm(path.join(RAIZ, 'src')).filter((f) => {
    const inicio = readFileSync(f, 'utf8').slice(0, 200);
    return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(inicio);
  });
}
