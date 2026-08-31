import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { readdirSync, statSync } from 'fs';

// POR QUE ESTE TESTE EXISTE
// A barreira do aceite legal vive em requireDecorator() (@/lib/api-auth), chamado
// por cada rota privada. O risco óbvio desse desenho é ESQUECER: uma rota nova
// autentica sozinha e nasce sem gate. Aqui a omissão vira erro de CI, e isentar
// uma rota passa a ser um ato deliberado, visível no diff.

const RAIZ = process.cwd();
const API = path.join(RAIZ, 'src', 'app', 'api');

// Rotas que NÃO passam pelo gate, cada uma com o motivo. Mexer nesta lista é
// afrouxar a barreira — que é exatamente o que se quer ver num code review.
const ISENTAS: Record<string, string> = {
  'decorators/me/route.ts': 'perfil próprio: a tela precisa dele ANTES de conseguir aceitar',
  'legal/acceptances/route.ts': 'é a própria rota de aceite — gatear seria um deadlock',
  'legal/decline/route.ts': 'saída da recusa: tem de funcionar sem aceite',
  'legal/documents/route.ts': 'só devolve as versões públicas; usada no cadastro, sem sessão',
  'public/decorator/[id]/route.ts': 'rota pública (cliente final, sem login)',
  'public/quote/[token]/route.ts': 'rota pública (cliente final, sem login)',
};

function rotas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const alvo = path.join(dir, nome);
    if (statSync(alvo).isDirectory()) return rotas(alvo);
    return nome === 'route.ts' ? [alvo] : [];
  });
}

const TODAS = rotas(API).map((f) => path.relative(API, f).split(path.sep).join('/'));

describe('Toda rota privada passa pelo gate', () => {
  it('encontrou as rotas (sanidade do próprio teste)', () => {
    expect(TODAS.length).toBeGreaterThan(15);
  });

  it('nenhuma rota privada deixou de chamar requireDecorator', () => {
    const semGate = TODAS.filter((rel) => {
      if (rel in ISENTAS) return false;
      return !readFileSync(path.join(API, rel), 'utf8').includes('requireDecorator(');
    });
    expect(
      semGate,
      `rota(s) sem gate: ${semGate.join(', ')}. Chame requireDecorator() de @/lib/api-auth, ` +
      `ou — se ela realmente deve ficar de fora — adicione à lista ISENTAS deste teste com o motivo.`,
    ).toEqual([]);
  });

  it('a lista de isenções não guarda rota que deixou de existir', () => {
    const fantasmas = Object.keys(ISENTAS).filter((rel) => !TODAS.includes(rel));
    expect(fantasmas, `isenção órfã (rota renomeada/removida): ${fantasmas.join(', ')}`).toEqual([]);
  });

  it('a porta sem gate não voltou a existir', () => {
    const culpadas = TODAS.filter((rel) => readFileSync(path.join(API, rel), 'utf8').includes('getSessionDecoratorId'));
    expect(culpadas, `getSessionDecoratorId foi removido de propósito: ${culpadas.join(', ')}`).toEqual([]);
  });
});
