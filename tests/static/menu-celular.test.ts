import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
//
// Abaixo de 1024px a barra lateral saía da tela e NÃO HAVIA COMO ABRI-LA: a
// classe .open existia no CSS e nada no app a aplicava. Quem usava o SB Gestor
// pelo celular ficava sem menu nenhum — e a dona tem clientes que preferem o
// celular.
//
// Estas provas guardam o painel deslizante: como abre, as quatro formas de
// fechar, o que acontece com a página de trás, e que o desktop não muda.
// O teste de verdade é num celular — estas provas garantem que ninguém desfaça
// o que foi testado lá.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');
const barra = ler('src/components/layout/Sidebar.tsx');
const cabecalho = ler('src/components/layout/Header.tsx');
const loja = ler('src/stores/menu-store.ts');
const css = ler('src/app/globals.css');
const regiaoCelular = css.slice(css.indexOf('/* ==================== MENU NO CELULAR'));

describe('existe um jeito de abrir', () => {
  it('o estado do menu é compartilhado entre cabeçalho e barra', () => {
    expect(loja).toMatch(/aberto: false/);
    for (const acao of ['abrir', 'fechar', 'alternar']) expect(loja).toMatch(new RegExp(`${acao}: \\(\\) =>`));
  });

  it('o cabeçalho tem o ☰, ligado à barra e anunciado', () => {
    expect(cabecalho).toMatch(/id="menu-abrir"/);
    expect(cabecalho).toMatch(/onClick=\{abrirMenu\}/);
    expect(cabecalho).toMatch(/aria-label="Abrir menu"/);
    expect(cabecalho).toMatch(/aria-expanded=\{menuAberto\}/);
    expect(cabecalho).toMatch(/aria-controls="menu-lateral"/);
    expect(barra, 'o aria-controls precisa apontar para um id que existe').toMatch(/id="menu-lateral"/);
  });

  it('aberto, a barra ganha a classe que a traz para a tela', () => {
    expect(barra).toMatch(/aberto && 'open'/);
  });
});

describe('as quatro formas de fechar', () => {
  it('pelo X', () => {
    expect(barra).toMatch(/className="sidebar-v2-fechar"\s+onClick=\{fechar\}/);
    expect(barra).toMatch(/aria-label="Fechar menu"/);
  });

  it('tocando fora (no fundo escuro)', () => {
    expect(barra).toMatch(/className=\{cn\('menu-fundo', aberto && 'visivel'\)\} onClick=\{fechar\}/);
  });

  it('com Esc', () => {
    expect(barra).toMatch(/if \(e\.key === 'Escape'\) fechar\(\)/);
  });

  it('sozinho ao navegar — senão o menu ficaria por cima da página nova', () => {
    expect(barra).toMatch(/useEffect\(\(\) => \{\s*fechar\(\);\s*\}, \[pathname, fechar\]\)/);
  });
});

describe('enquanto aberto, a página de trás some', () => {
  it('fica inerte e não rola', () => {
    expect(barra).toMatch(/principal\?\.setAttribute\('inert', ''\)/);
    expect(barra).toMatch(/document\.body\.style\.overflow = 'hidden'/);
  });

  it('e volta ao normal quando fecha', () => {
    expect(barra).toMatch(/principal\?\.removeAttribute\('inert'\)/);
    expect(barra).toMatch(/document\.body\.style\.overflow = overflowAntes/);
  });

  it('o foco entra no X ao abrir e volta ao ☰ ao fechar', () => {
    expect(barra).toMatch(/fecharRef\.current\?\.focus\(\)/);
    expect(barra).toMatch(/gatilho\?\.focus\(\)/);
  });

  it('é anunciado como diálogo só enquanto aberto', () => {
    expect(barra).toMatch(/aberto \? \{ role: 'dialog', 'aria-modal': true, 'aria-label': 'Menu' \} : \{\}/);
  });

  it('o fundo fica acima do cabeçalho (50) e abaixo da barra (100) e dos modais (1000)', () => {
    const z = Number(regiaoCelular.match(/\.menu-fundo \{[^}]*z-index: (\d+)/)?.[1]);
    expect(z).toBeGreaterThan(50);
    expect(z).toBeLessThan(100);
  });
});

describe('o desktop continua como está', () => {
  it('o ☰, o X e o fundo ficam escondidos fora do celular', () => {
    const antesDaMidia = regiaoCelular.slice(0, regiaoCelular.indexOf('@media (max-width: 1024px)'));
    expect(antesDaMidia).toMatch(/\.header-menu-btn,\s*\.sidebar-v2-fechar \{\s*display: none;/);
    expect(antesDaMidia).toMatch(/\.menu-fundo \{\s*display: none;/);
  });

  it('aberto numa tela larga, o painel fecha — a barra já está visível', () => {
    expect(barra).toMatch(/if \(!celular\.matches\) \{\s*fechar\(\);/);
    expect(barra).toMatch(/const CONSULTA_CELULAR = '\(max-width: 1024px\)'/);
  });

  it('a barra do desktop mantém a largura e a posição fixa', () => {
    const base = css.slice(css.indexOf('/* ==================== SIDEBAR V2 (Light)'), css.indexOf('/* ==================== HEADER ===================='));
    expect(base).toMatch(/width: 260px;/);
    expect(base).toMatch(/position: fixed;/);
  });

  it('recolher continua sendo coisa do desktop; o painel vem sempre inteiro', () => {
    expect(barra).toMatch(/const recolhida = collapsed && !aberto;/);
  });
});

describe('o que não podia mudar', () => {
  it('o cabeçalho mostra só o nome do sistema, igual em toda conta', () => {
    // Era "Bem-vindo(a) ao SB GESTOR". A dona tirou a saudação (16/09/2026):
    // quem diz em qual conta ela está é a barra lateral, com a logo e o nome
    // da empresa dela — e isso continua valendo (asserção abaixo).
    expect(cabecalho).toMatch(/<div className="header-title">SB GESTOR<\/div>/);
    expect(cabecalho).not.toMatch(/Bem-vindo/);
    expect(barra, 'a barra lateral continua identificando a conta')
      .toMatch(/\{decorator\?\.name \|\| 'SB GESTOR'\}/);
  });

  // ATUALIZADO (17/09/2026): o Suporte DEIXOU de ser "fica para depois". A dona
  // especificou a aba, e ela existe em /suporte. O que este teste guarda agora é
  // o oposto do que guardava: o link não pode voltar a ser href="#" — um item de
  // menu que não vai a lugar nenhum é pior do que item nenhum, porque ela clica
  // e conclui que o sistema travou. O resto da aba é guardado em suporte.test.ts.
  it('o Suporte leva para a aba de Suporte', () => {
    expect(barra).toMatch(/href="\/suporte"/);
    expect(barra).not.toMatch(/<a href="#" className="sidebar-v2-bottom-link"/);
  });

  it('quem pediu menos movimento recebe o painel sem deslizar', () => {
    expect(regiaoCelular).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.sidebar-v2,\s*\.menu-fundo \{\s*transition: none;/);
  });
});
