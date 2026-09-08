import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
//
// A tela do Acervo gravava a peça no instante em que se clicava em "Criar novo
// item" — antes de o valor ser preenchido. O valor ia depois para o KIT, a peça
// ficava em zero, e sobravam DOIS cards: a peça sem preço e um kit de um item.
//
// A primeira correção adiou a gravação mas manteve a decisão automática ("1
// item vira peça, 2+ vira kit"). O desenho atual tirou a adivinhação do código:
// a decoradora escolhe "Criar item" ou "Criar kit" ANTES de preencher. Estas
// provas guardam que a escolha continua explícita e que nada é gravado antes do
// Salvar — as duas metades do problema original.

const fonte = readFileSync(path.join(RAIZ, 'src/app/(dashboard)/inventory/page.tsx'), 'utf8');

/** Corpo de uma função declarada como `const nome = ... => {` até a próxima. */
function corpoDe(nome: string): string {
  const inicio = fonte.indexOf(`const ${nome} =`);
  expect(inicio, `${nome} não encontrada`).toBeGreaterThan(-1);
  const proxima = fonte.indexOf('\n  const ', inicio + 1);
  return fonte.slice(inicio, proxima === -1 ? fonte.length : proxima);
}

describe('nada é gravado antes do Salvar', () => {
  it('"Criar novo item" NÃO chama saveInventoryItem', () => {
    expect(corpoDe('handleCreateKitInventoryItem'), 'gravar aqui é o bug original')
      .not.toMatch(/saveInventoryItem/);
  });

  it('a peça entra na lista como PENDENTE, com id que não colide com id real', () => {
    expect(fonte).toMatch(/const PREFIXO_PENDENTE = 'pendente:'/);
    expect(corpoDe('handleCreateKitInventoryItem')).toMatch(/PREFIXO_PENDENTE/);
  });
});

describe('o tipo é ESCOLHIDO, não deduzido', () => {
  it('existe um estado de tipo do modal', () => {
    expect(fonte).toMatch(/const \[modalTipo, setModalTipo\] = useState<'item' \| 'kit'>/);
  });

  it('abrir a criação exige dizer o tipo', () => {
    expect(fonte).toMatch(/handleOpenCreateModal = \(tipo: 'item' \| 'kit'\)/);
    expect(fonte, 'o menu precisa oferecer as duas opções').toMatch(/handleOpenCreateModal\('item'\)/);
    expect(fonte).toMatch(/handleOpenCreateModal\('kit'\)/);
  });

  it('o Salvar despacha pelo TIPO, nunca pela quantidade de itens', () => {
    const corpo = corpoDe('handleSaveKit');
    expect(corpo).toMatch(/modalTipo === 'item' \? salvarPeca\(\) : salvarKit\(\)/);
    expect(corpo, 'decidir por contagem é a ambiguidade que este desenho eliminou')
      .not.toMatch(/linkedItems\.length === 1/);
  });

  it('nenhum caminho de salvamento decide o tipo por contagem', () => {
    for (const fn of ['salvarPeca', 'salvarKit']) {
      expect(corpoDe(fn), `${fn} não deve olhar a contagem para escolher tipo`)
        .not.toMatch(/linkedItems\.length === 1/);
    }
  });

  it('a seção de itens só aparece no fluxo de kit', () => {
    // Mostrá-la ao criar uma peça era o que fazia a decoradora adicionar itens
    // sem saber que aquilo mudaria o tipo do que estava criando.
    expect(fonte).toMatch(/\{modalTipo === 'kit' && \(/);
  });
});

describe('peça com nome repetido atualiza, e avisa antes', () => {
  const corpo = corpoDe('salvarPeca');

  it('procura peça existente pelo NOME antes de criar outra', () => {
    expect(corpo, 'sem isto, salvar um nome que já existe cria o par duplicado')
      .toMatch(/items\.find\(\(i\) => i\.name\.trim\(\)\.toLowerCase\(\) === nome\.toLowerCase\(\)\)/);
  });

  it('avisa ANTES de trocar o preço', () => {
    const aviso = corpo.indexOf('window.confirm');
    const grava = corpo.indexOf('saveInventoryItem({ ...existente');
    expect(aviso, 'sem confirmação, o preço muda em silêncio').toBeGreaterThan(-1);
    expect(grava).toBeGreaterThan(-1);
    expect(aviso, 'o aviso precisa vir ANTES da gravação').toBeLessThan(grava);
  });

  it('o aviso mostra os DOIS valores', () => {
    expect(corpo).toMatch(/de \$\{formatPriceLabel\(de\)\} para \$\{formatCurrency\(valor\)\}/);
  });
});

describe('o kit continua referenciando peças reais', () => {
  const corpo = corpoDe('salvarKit');

  it('as peças pendentes são criadas ANTES do kit', () => {
    // O kit guarda ids; a locação B2B expande o kit em demanda POR PEÇA. Id
    // temporário gravado no kit sairia do controle de estoque e deixaria alugar
    // duas vezes a mesma peça física.
    const criaPecas = corpo.indexOf('idsFinais.set');
    const criaKit = corpo.indexOf('saveKit(');
    expect(criaPecas).toBeGreaterThan(-1);
    expect(criaKit).toBeGreaterThan(-1);
    expect(criaPecas, 'criar o kit antes das peças gravaria id temporário').toBeLessThan(criaKit);
  });

  it('nenhum id temporário chega ao kit', () => {
    expect(corpo).toMatch(/idsFinais\.get\(i\.id\) \?\? i\.id/);
  });

  it('peça criada dentro de um kit nasce sem preço próprio', () => {
    // Num kit o valor é do CONJUNTO; a decoradora define o das peças depois.
    expect(corpo).toMatch(/rental_price: 0/);
  });
});

describe('grid de cartões não estica quando há poucos', () => {
  const css = readFileSync(path.join(RAIZ, 'src/app/globals.css'), 'utf8');

  it('lista de tamanho variável usa auto-FILL', () => {
    // auto-fit colapsa as trilhas vazias: um kit sozinho esticava para a largura
    // inteira da tela — pior que o problema que a conversão veio resolver.
    const bloco = css.slice(css.indexOf('.acervo-product-grid {'));
    expect(bloco.slice(0, 200)).toMatch(/repeat\(auto-fill, minmax\(260px, 1fr\)\)/);
  });

  it('linha de contagem fixa segue com auto-FIT', () => {
    // Com auto-fill, um painel largo criaria uma trilha vazia e deixaria os
    // campos do formulário estreitos com um buraco à direita.
    const bloco = css.slice(css.indexOf('.grid-3 {'));
    expect(bloco.slice(0, 200)).toMatch(/repeat\(auto-fit, minmax\(190px, 1fr\)\)/);
  });
});
