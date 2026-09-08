import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
//
// A tela do Acervo gravava a peça no instante em que se clicava em "Criar novo
// item" — antes de a decoradora preencher o valor. Ao salvar, o valor ia para o
// KIT e a peça ficava em zero: o card aparecia sem preço e parecia defeito.
// Desistir no meio do modal também deixava a peça no acervo.
//
// A migração já consertou os dados (10 kits de um componente); estas provas
// guardam o COMPORTAMENTO, que é o que faria o problema voltar.

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
    const corpo = corpoDe('handleCreateKitInventoryItem');
    expect(corpo, 'gravar aqui é o bug original: a peça nasce sem o valor que ainda será digitado')
      .not.toMatch(/saveInventoryItem/);
  });

  it('a peça entra na lista como PENDENTE, com id que não colide com id real', () => {
    expect(fonte).toMatch(/const PREFIXO_PENDENTE = 'pendente:'/);
    expect(corpoDe('handleCreateKitInventoryItem')).toMatch(/PREFIXO_PENDENTE/);
  });
});

describe('o tipo é decidido no Salvar, pela composição', () => {
  const corpo = corpoDe('handleSaveKit');

  it('um item só toma caminho diferente de vários', () => {
    expect(corpo, 'sem esta ramificação volta a criar kit para tudo')
      .toMatch(/linkedItems\.length === 1/);
  });

  it('editar um kit existente NÃO vira peça avulsa', () => {
    // Converter em silêncio apagaria um kit que pode estar referenciado numa
    // locação ou num orçamento — o histórico depende dele.
    expect(corpo).toMatch(/linkedItems\.length === 1 && !editingKitId/);
  });

  it('peça que já existe é avisada ANTES de ter o preço trocado', () => {
    const aviso = corpo.indexOf('window.confirm');
    const grava = corpo.indexOf('saveInventoryItem({ ...existente');
    expect(aviso, 'sem confirmação, o preço muda em silêncio').toBeGreaterThan(-1);
    expect(grava, 'o caminho da peça existente deveria gravar').toBeGreaterThan(-1);
    expect(aviso, 'o aviso precisa vir ANTES da gravação').toBeLessThan(grava);
  });

  it('o aviso mostra os DOIS valores, não só o novo', () => {
    expect(corpo).toMatch(/será atualizado de \$\{formatPriceLabel\(de\)\} para \$\{formatCurrency\(parsedValue\)\}/);
  });
});

describe('o kit continua referenciando peças reais', () => {
  const corpo = corpoDe('handleSaveKit');

  it('as peças pendentes são criadas ANTES do kit', () => {
    // O kit guarda ids; a locação B2B expande o kit em demanda POR PEÇA. Um id
    // temporário gravado no kit sairia do controle de estoque e deixaria alugar
    // duas vezes a mesma peça física.
    const criaPecas = corpo.indexOf('idsFinais.set');
    const criaKit = corpo.indexOf('saveKit(kitData)');
    expect(criaPecas).toBeGreaterThan(-1);
    expect(criaKit).toBeGreaterThan(-1);
    expect(criaPecas, 'criar o kit antes das peças gravaria id temporário').toBeLessThan(criaKit);
  });

  it('nenhum id temporário chega ao kit', () => {
    expect(corpo, 'o id pendente tem de ser trocado pelo real na composição')
      .toMatch(/idsFinais\.get\(i\.id\) \?\? i\.id/);
  });

  it('peça criada dentro de um kit nasce sem preço próprio', () => {
    // Num kit o valor é do CONJUNTO. Preço individual inventado apareceria na
    // aba de peças avulsas como se a peça fosse vendável sozinha por aquilo.
    const trecho = corpo.slice(corpo.indexOf('const idsFinais'));
    expect(trecho).toMatch(/rental_price: 0/);
  });
});
