import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
//
// No celular a foto de perfil da Minha Página aparecia espremida — um oval
// estreito e alto — enquanto no desktop ficava certa. A causa é a soma de duas
// regras que, sozinhas, parecem inofensivas:
//
//   1. o reset global `img { max-width: 100% }`;
//   2. o avatar mora num item flex dentro de .mypage-profile-card, que podia
//      encolher quando a tela apertava.
//
// Ao encolher, a LARGURA acompanhava a caixa e a ALTURA continuava 100px: o
// círculo virava oval. flex-shrink:0 no item tira a caixa da conta do aperto,
// então a foto continua quadrada em qualquer largura.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');
const css = ler('src/app/globals.css');
const pagina = ler('src/app/(dashboard)/marketplace/my-page/page.tsx');

const MARCA = '/* ==================== MINHA PÁGINA NO CELULAR';
const inicio = css.indexOf(MARCA);
// O bloco vai até o começo da próxima seção, não até o fim do arquivo: senão
// qualquer seção acrescentada depois entraria na conta deste teste.
const proxima = css.indexOf('/* ====================', inicio + MARCA.length);
const bloco = css.slice(inicio, proxima === -1 ? undefined : proxima);

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
const cel = regrasDoTopo(bloco)
  .filter(([p]) => p === '@media (max-width: 640px)').map(([, c]) => c).join('\n');

describe('a causa raiz', () => {
  it('o bloco existe', () => {
    expect(css.indexOf(MARCA)).toBeGreaterThan(-1);
  });

  it('as duas regras que se somavam continuam onde estavam', () => {
    // Se o reset sair um dia, este teste avisa que a explicação envelheceu.
    expect(css).toMatch(/^img \{ max-width: 100%;/m);
    expect(css).toMatch(/\.mypage-profile-card \{[^}]*display: flex;/);
  });

  it('a caixa do avatar não entra na conta do aperto', () => {
    expect(bloco).toMatch(/\.mypage-profile-avatar-wrap \{[^}]*flex-shrink: 0;/);
    expect(bloco).toMatch(/\.mypage-profile-avatar \{\s*flex-shrink: 0;\s*\}/);
  });

  it('o item flex da página carrega essa classe', () => {
    // A classe precisa estar na DIV que é item flex, não só na <img>: é ela
    // que encolhe. Sem isto o CSS acima não pega em nada.
    expect(pagina).toMatch(/<div className="relative mypage-profile-avatar-wrap">/);
  });
});

describe('o desktop não muda', () => {
  it('o avatar continua 100px com a mesma moldura', () => {
    const base = css.slice(0, css.indexOf(MARCA));
    expect(base).toMatch(/\.mypage-profile-avatar \{\s*width: 100px;\s*height: 100px;/);
    expect(base).toMatch(/\.mypage-profile-card \{[^}]*margin-left: 32px;/);
  });

  it('o que muda de tamanho mora dentro de @media (max-width: 640px)', () => {
    for (const [prel, corpo] of regrasDoTopo(bloco)) {
      if (/width:|font-size:|padding:|margin-/.test(corpo)) {
        expect(prel, `"${prel}" mudaria o desktop também`).toMatch(/^@media \(max-width: 640px\)$/);
      }
    }
  });
});

describe('Minha Página no celular', () => {
  it('a foto encolhe de propósito — quadrada, os dois lados juntos', () => {
    expect(cel).toMatch(/\.mypage-profile-avatar,\s*\.mypage-profile-avatar-placeholder \{\s*width: 76px;\s*height: 76px;/);
  });

  it('as iniciais (quando não há foto) acompanham o tamanho menor', () => {
    expect(cel).toMatch(/\.mypage-profile-avatar-placeholder \{\s*font-size: 26px;/);
  });

  it('os botões quebram a linha em vez de vazar do cartão', () => {
    // Medido em 320px: "Editar Perfil" + compartilhar lado a lado pedem ~194px
    // e sobram ~166px. Sem a quebra, o botão sairia para fora do cartão.
    expect(pagina).toMatch(/className="flex gap-2 mypage-profile-actions"/);
    expect(pagina).toMatch(/className="flex-1 mt-8[^"]*mypage-profile-body"/);
    expect(cel).toMatch(/\.mypage-profile-actions \{\s*flex-wrap: wrap;/);
    expect(cel).toMatch(/\.mypage-profile-body \{\s*min-width: 0;/);
  });

  it('o cartão devolve largura para o nome e os botões', () => {
    expect(cel).toMatch(/\.mypage-profile-card \{[^}]*margin-left: 16px;[^}]*padding: 16px;/);
    expect(cel).toMatch(/\.mypage-profile-name \{\s*font-size: 19px;/);
  });
});
