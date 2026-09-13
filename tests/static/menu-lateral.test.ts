import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import {
  totalDePecas, rotuloDePecas, rotuloDeNaoLidas, formatarContador, contarNaoLidas,
} from '@/lib/menu-contadores';

// POR QUE ESTE TESTE EXISTE
//
// A barra lateral ganhou o visual de um print de referência, com duas regras
// firmes da spec: (1) nenhum texto de item muda — o print é referência de
// estrutura, não de conteúdo; (2) contadores e badges mostram DADO REAL, nunca
// os valores fixos do print ("184 peças", "3", "Alugar", "B2B").
//
// E duas decisões da dona: o cabeçalho continua com a foto e o nome da
// decoradora (é o único lugar que diz em qual conta ela está), e o Calendário
// fica sem ponto de notificação.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');
const barra = ler('src/components/layout/Sidebar.tsx');

describe('os textos dos itens são os de sempre', () => {
  // A lista que existia antes da mudança. Se um rótulo mudar, este teste acusa.
  const ROTULOS = ['Dashboard', 'Meu Acervo', 'Marketplace', 'Minha Página', 'Chat', 'Formulário', 'Calendário', 'Clientes'];

  it('cada item antigo continua com o rótulo exato', () => {
    for (const rotulo of ROTULOS) {
      expect(barra, `o item "${rotulo}" sumiu ou mudou de texto`).toContain(`label: '${rotulo}'`);
    }
  });

  it('não há item novo nem removido', () => {
    const encontrados = [...barra.matchAll(/label: '([^']+)'/g)].map((m) => m[1]).sort();
    expect(encontrados).toEqual([...ROTULOS].sort());
  });

  it('o bloco inferior mantém Suporte e Configurações', () => {
    expect(barra).toMatch(/<span>Suporte<\/span>/);
    expect(barra).toMatch(/<span>Configurações<\/span>/);
  });

  it('nenhum texto ou valor fixo do print entrou', () => {
    for (const fixo of ['Alugar', 'B2B', '184', 'Suporte VIP', 'Calendário / Agenda', 'Marketplace Decor',
      'Formulário de Orçamento', 'Minha Página (Bio)', 'Gestão para Decoradoras']) {
      expect(barra, `"${fixo}" é conteúdo do print, não do sistema`).not.toContain(fixo);
    }
  });
});

describe('as decisões da dona', () => {
  it('o cabeçalho continua com a foto e o nome da decoradora', () => {
    expect(barra).toMatch(/decorator\?\.avatar_url/);
    expect(barra).toMatch(/getInitials\(decorator\?\.name\)/);
    expect(barra).toMatch(/\{decorator\?\.name \|\| 'SB GESTOR'\}/);
  });

  it('o Calendário não tem contador nem ponto', () => {
    const linha = barra.split('\n').find((l) => l.includes("label: 'Calendário'")) ?? '';
    expect(linha, 'a dona decidiu: Calendário sem ponto').not.toMatch(/contador/);
  });

  it('só Meu Acervo e Chat levam contador', () => {
    expect(barra).toMatch(/label: 'Meu Acervo'.*contador: 'pecas'/);
    expect(barra).toMatch(/label: 'Chat'.*contador: 'naoLidas'/);
    expect(barra.match(/contador: '/g)).toHaveLength(2);
  });
});

describe('o número da barra é o mesmo do Acervo', () => {
  it('as duas telas usam a mesma função de contagem', () => {
    // Se cada uma somasse do seu jeito, a barra poderia dizer 184 e o Acervo 182.
    expect(barra).toMatch(/totalDePecas\(items\)/);
    expect(ler('src/app/(dashboard)/inventory/page.tsx')).toMatch(/const totalItems = totalDePecas\(items\)/);
  });

  it('soma o estoque, e não o número de cadastros', () => {
    expect(totalDePecas([{ stock_quantity: 10 }, { stock_quantity: 4 }, { stock_quantity: 0 }])).toBe(14);
  });

  it('estoque ausente conta como zero, e não vira NaN', () => {
    expect(totalDePecas([{ stock_quantity: 3 }, { stock_quantity: null as unknown as number }])).toBe(3);
  });

  it('rótulo em português, com singular e milhar', () => {
    expect(rotuloDePecas(1)).toBe('1 peça');
    expect(rotuloDePecas(184)).toBe('184 peças');
    expect(rotuloDePecas(1840)).toBe('1.840 peças');
  });
});

describe('não lidas = recebidas depois da última visita ao Chat', () => {
  const EU = 'dec-eu';
  const VISTO = Date.parse('2026-09-13T12:00:00Z');
  const msg = (de: string, para: string, quando: string) => ({ sender_id: de, receiver_id: para, created_at: quando });

  it('conta só as que eu RECEBI depois da visita', () => {
    const lista = [
      msg('dec-a', EU, '2026-09-13T12:05:00Z'),  // recebida depois  -> conta
      msg('dec-b', EU, '2026-09-13T13:00:00Z'),  // recebida depois  -> conta
      msg('dec-a', EU, '2026-09-13T11:00:00Z'),  // recebida ANTES   -> não
      msg(EU, 'dec-a', '2026-09-13T12:30:00Z'),  // EU enviei        -> não
    ];
    expect(contarNaoLidas(lista, EU, VISTO)).toBe(2);
  });

  it('sem visita registrada devolve 0 — o histórico não vira "não lido"', () => {
    expect(contarNaoLidas([msg('dec-a', EU, '2026-09-13T12:05:00Z')], EU, null)).toBe(0);
  });

  it('sem conta identificada devolve 0', () => {
    expect(contarNaoLidas([msg('dec-a', EU, '2026-09-13T12:05:00Z')], undefined, VISTO)).toBe(0);
  });

  it('acima de 9 vira "9+", e o nome acessível diz o número inteiro', () => {
    expect(formatarContador(3)).toBe('3');
    expect(formatarContador(12)).toBe('9+');
    expect(rotuloDeNaoLidas(1)).toBe('1 mensagem não lida');
    expect(rotuloDeNaoLidas(12)).toBe('12 mensagens não lidas');
  });

  it('dentro do Chat o contador zera e a visita é registrada', () => {
    expect(barra).toMatch(/const naoLidas = noChat \? 0 : contarNaoLidas\(/);
    expect(barra).toMatch(/if \(noChat \|\| !localStorage\.getItem\(chaveVisto\)\)/);
  });
});

describe('acessibilidade que o redesenho corrigiu', () => {
  it('o item ativo é anunciado com aria-current', () => {
    expect(barra).toMatch(/aria-current=\{ativo \? 'page' : undefined\}/);
  });

  it('com a barra recolhida o link não perde o nome', () => {
    // O texto some com display:none; sem aria-label, o link ficava mudo.
    expect(barra).toMatch(/aria-label=\{nome\}/);
    expect(barra).toMatch(/aria-label="Suporte"/);
    expect(barra).toMatch(/aria-label="Configurações"/);
  });
});

describe('o visual respeita o piso de qualidade', () => {
  const css = ler('src/app/globals.css');
  const inicio = css.indexOf('/* ==================== SIDEBAR V2 (Light) ==================== */');
  const fim = css.indexOf('/* ==================== HEADER ==================== */');
  const regiao = css.slice(inicio, fim);

  it('o item ativo usa fundo sólido, sem borda colorida à esquerda', () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(regiao).not.toMatch(/border-left:\s*[2-9]px/);
    expect(regiao).toMatch(/\.sidebar-v2-link\.active \{\s*background: var\(--sb-petroleo\);/);
  });

  it('as cores escolhidas são as de contraste medido', () => {
    // #0088B0 com branco dá 4,1:1 e reprova para 14px; o ativo é o tom escuro.
    expect(regiao).toMatch(/--sb-petroleo: #0b4f5e;/);
    expect(regiao).toMatch(/--sb-rotulo: #64748b;/);
  });

  it('o bloco inferior fica fixo mesmo quando o menu rola', () => {
    expect(regiao).toMatch(/\.sidebar-v2-bottom \{\s*position: sticky;\s*bottom: 0;/);
  });
});
