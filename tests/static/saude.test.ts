import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
//
// /api/billing/saude é a rota de DIAGNÓSTICO do operador — e a primeira versão
// não tinha try/catch. Uma falha no banco virou 500 VAZIO: o Chrome mostrou
// "Esta página não está funcionando" e não sobrou pista nenhuma, exatamente no
// momento em que o operador abriu a rota para descobrir o que estava errado.
//
// Mesmo defeito que derrubou /api/billing/subscribe mais cedo. Rota que existe
// para explicar falha não pode ela mesma falhar calada.

const fonte = readFileSync(path.join(RAIZ, 'src/app/api/billing/saude/route.ts'), 'utf8');

describe('a rota de saúde nunca morre calada', () => {
  it('todo o corpo roda dentro de um try', () => {
    const inicio = fonte.indexOf('export async function GET()');
    const tryPos = fonte.indexOf('try {', inicio);
    const sessao = fonte.indexOf('await requireDecorator()', inicio);
    expect(tryPos, 'sem try, a exceção vira 500 vazio').toBeGreaterThan(-1);
    expect(tryPos, 'o try precisa começar ANTES da leitura da sessão').toBeLessThan(sessao);
    expect(fonte).toMatch(/\} catch \(motivo\) \{/);
  });

  it('as duas partes rodam com allSettled, e não all', () => {
    // Com Promise.all, uma parte quebrada derruba a outra: o banco falhando
    // esconderia o veredito do Mercado Pago, que é justamente o que se procura.
    expect(fonte).toMatch(/Promise\.allSettled\(\[saudeDoJob\(\), diagnosticoCredencial\(\)\]\)/);
    expect(fonte, 'Promise.all voltaria a acoplar as duas partes').not.toMatch(/Promise\.all\(/);
  });

  it('cada falha fica no log com etiqueta buscável', () => {
    expect(fonte).toMatch(/\[SAUDE-FALHA\] \$\{parte\}/);
    expect(fonte).toMatch(/\[SAUDE-FALHA\] geral/);
  });

  it('o motivo passa pela redação de segredos', () => {
    expect(fonte).toMatch(/redigirSegredos\(/);
  });
});

describe('o detalhe só aparece para o operador', () => {
  it('o motivo no JSON só vem DEPOIS da guarda de operador', () => {
    const guarda = fonte.indexOf('process.env.OPERADOR_DECORATOR_ID !== acesso.decoratorId');
    const detalhe = fonte.indexOf("relatar('job', job)");
    expect(guarda).toBeGreaterThan(-1);
    expect(detalhe, 'detalhe interno antes da guarda vazaria para a decoradora').toBeGreaterThan(guarda);
  });

  it('a falha geral, antes de saber quem pediu, devolve só mensagem genérica', () => {
    const catchGeral = fonte.slice(fonte.indexOf('} catch (motivo) {'));
    expect(catchGeral).toMatch(/error: 'Não foi possível consultar a saúde agora\.'/);
    expect(catchGeral, 'sem saber quem pediu, o motivo não pode ir no corpo')
      .not.toMatch(/NextResponse\.json\(\{[^}]*motivoLegivel/);
  });
});
