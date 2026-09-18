import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
//
// No celular, Calendário e Clientes ficavam mais largos que a tela (numa tela
// de 360px: 592px e 748px), com rolagem lateral e conteúdo cortado. A causa era
// uma só: .main-area, item flex com min-width:auto, crescia até caber a grade
// de 7 colunas / a tabela de 7 colunas.
//
// A medição de verdade foi feita no navegador, em 360, 390, 768 e 1280px. Este
// teste guarda o que ela provou: a causa raiz corrigida, o desktop intocado
// (toda regra nova mora dentro de @media max-width) e os cartões de Clientes
// com os mesmos rótulos das colunas.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');
const css = ler('src/app/globals.css');
const MARCA = '/* ==================== CALENDÁRIO E CLIENTES NO CELULAR';
const inicio = css.indexOf(MARCA);
// O bloco vai até o começo da próxima seção, não até o fim do arquivo: senão
// qualquer seção acrescentada depois entraria na conta deste teste.
const proxima = css.indexOf('/* ====================', inicio + MARCA.length);
const bloco = css.slice(inicio, proxima === -1 ? undefined : proxima);
const clientes = ler('src/app/(dashboard)/clients/page.tsx');

// Regras de primeiro nível do bloco: [prelúdio, corpo].
function regrasDoTopo(fonte: string): [string, string][] {
  const s = fonte.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: [string, string][] = [];
  let prof = 0, ini = 0, prel = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') { if (prof === 0) { prel = s.slice(ini, i).trim(); ini = i + 1; } prof++; }
    else if (s[i] === '}') { prof--; if (prof === 0) { out.push([prel, s.slice(ini, i)]); ini = i + 1; } }
  }
  return out;
}
const midia = (max: number) => regrasDoTopo(bloco)
  .filter(([p]) => p === `@media (max-width: ${max}px)`).map(([, c]) => c).join('\n');

describe('o desktop não muda', () => {
  it('o bloco existe', () => {
    expect(css.indexOf(MARCA)).toBeGreaterThan(-1);
  });

  it('toda regra nova está dentro de um @media (max-width)', () => {
    const regras = regrasDoTopo(bloco);
    expect(regras.length).toBeGreaterThan(0);
    for (const [prel] of regras) {
      expect(prel, `"${prel}" valeria também no desktop`).toMatch(/^@media \(max-width: \d+px\)$/);
    }
  });

  it('as regras de desktop do Calendário e da tabela continuam as mesmas', () => {
    const base = css.slice(0, css.indexOf(MARCA));
    expect(base).toMatch(/\.calendar-grid \{\s*display: grid;\s*grid-template-columns: repeat\(7, 1fr\);/);
    expect(base).toMatch(/\.calendar-toolbar-label \{[^}]*min-width: 160px;/);
    expect(base).toMatch(/\.calendar-pill \{[^}]*font-size: 10\.5px;/);
    expect(base).toMatch(/\.data-table th \{[^}]*padding: 12px 16px;/);
  });
});

describe('a causa raiz', () => {
  it('abaixo de 1024px o conteúdo cabe na tela (main-area pode encolher)', () => {
    expect(midia(1024)).toMatch(/\.main-area \{\s*min-width: 0;/);
  });
});

describe('Calendário no celular', () => {
  const cel = midia(640);

  it('as colunas não crescem para caber o texto', () => {
    expect(cel).toMatch(/\.calendar-weekday-header,\s*\.calendar-grid \{\s*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/);
    expect(cel).toMatch(/\.calendar-cell \{[^}]*min-width: 0;/);
  });

  it('"Novo Evento" vai para a própria linha, na largura toda', () => {
    expect(cel).toMatch(/\.calendar-toolbar-right \{[^}]*flex-wrap: wrap;/);
    expect(cel).toMatch(/\.calendar-toolbar-right > \.btn-base \{[^}]*flex: 1 1 100%;/);
    expect(cel).toMatch(/\.calendar-toolbar-label \{[^}]*min-width: 0;/);
  });

  it('evento vira ponto, sem perder o texto do HTML', () => {
    expect(cel).toMatch(/\.calendar-pill \{[^}]*font-size: 0;/);
    expect(cel, 'display:none tiraria o evento também do leitor de tela').not.toMatch(/\.calendar-pill \{[^}]*display: none/);
  });

  it('a retirada tem cor no celular — a variável da landing não existe no app', () => {
    // --lp-primary só é definida em .lp (landing). Sem isto, o ponto de
    // retirada no celular não teria cor: o evento sumiria da tela.
    expect(css).toMatch(/\.lp \{[^}]*--lp-primary: #006482;/);
    expect(cel).toMatch(/\.calendar-panel \{[^}]*--lp-primary: #006482;/);
  });

  it('o ponto de evento interno tem o mesmo contorno da legenda', () => {
    expect(css).toMatch(/\.calendar-legend-dot\.internal \{[^}]*border: 1px solid var\(--primary\);/);
    expect(cel).toMatch(/\.calendar-pill-internal \{\s*border-color: var\(--primary\);/);
  });

  it('texto pequeno com contraste de leitura (#64748b, 4,8:1), não o cinza-claro', () => {
    expect(cel).toMatch(/\.calendar-weekday-header span \{[^}]*color: var\(--text-secondary\);/);
    expect(cel).toMatch(/\.calendar-pill-more \{[^}]*color: var\(--text-secondary\);/);
  });
});

describe('Clientes no celular: tabela vira cartões', () => {
  const cel = midia(820);

  it('a tabela de Clientes é marcada para virar cartões', () => {
    expect(clientes).toMatch(/<Table className="clients-table" headers=/);
  });

  it('cada célula leva o nome da coluna, na mesma ordem do cabeçalho', () => {
    const cab = clientes.match(/headers=\{\[([^\]]+)\]\}/)?.[1] ?? '';
    const colunas = [...cab.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const linha = clientes.slice(clientes.indexOf('<tr key={event.id}>'), clientes.indexOf('</tr>', clientes.indexOf('<tr key={event.id}>')));
    const rotulos = [...linha.matchAll(/<td[^>]*data-label="([^"]+)"/g)].map((m) => m[1]);
    expect(colunas.length).toBe(7);
    expect(rotulos, 'um rótulo diferente do cabeçalho mostraria outro nome no cartão').toEqual(colunas);
    expect((linha.match(/<td\b/g) || []).length, 'toda célula precisa de rótulo').toBe(colunas.length);
  });

  it('o cabeçalho some e o rótulo aparece ao lado de cada valor', () => {
    expect(cel).toMatch(/\.clients-table thead \{\s*display: none;/);
    expect(cel).toMatch(/\.clients-table td::before \{\s*content: attr\(data-label\);/);
  });

  it('os filtros empilham na largura toda', () => {
    expect(cel).toMatch(/\.clients-filter-bar \{\s*flex-direction: column;/);
    expect(cel).toMatch(/\.clients-filter-bar \.search-bar,\s*\.clients-filter-bar \.month-filter-input \{\s*width: 100%;/);
  });
});
