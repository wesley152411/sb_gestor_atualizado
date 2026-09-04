import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ, grafoDe, fontesEm, componentesCliente } from './grafo';

// O Access Token do Mercado Pago move dinheiro. Que ele não vaze para o navegador
// não pode depender de ninguém lembrar: aqui vira erro de CI.

const MODULO_MP = path.join(RAIZ, 'src', 'lib', 'mercadopago.ts');

// Onde procurar prefixo proibido. docs/ fica de fora porque o próprio desenho
// CITA os prefixos como proibição — e este arquivo também.
const AREAS = ['src', 'scripts', 'tests'].map((d) => path.join(RAIZ, d));
const ESTE_ARQUIVO = path.join(RAIZ, 'tests', 'static', 'mercadopago-chaves.test.ts');

describe('o Access Token do Mercado Pago não alcança o navegador', () => {
  it("mercadopago.ts é marcado com 'server-only'", () => {
    const fonte = readFileSync(MODULO_MP, 'utf8');
    expect(fonte.startsWith("import 'server-only';"), 'a marca tem de ser a PRIMEIRA linha').toBe(true);
  });

  it('nenhum componente cliente alcança @/lib/mercadopago', () => {
    const culpados = componentesCliente().filter((arquivo) => grafoDe(arquivo).vistos.has(MODULO_MP));
    expect(
      culpados.map((f) => path.relative(RAIZ, f)),
      'componente cliente importando o módulo do Access Token (direta ou indiretamente)',
    ).toEqual([]);
  });

  it('não existe variável NEXT_PUBLIC_ para segredo de cobrança', () => {
    // NEXT_PUBLIC_ faz o Next embutir o valor no bundle do navegador. Para o
    // Access Token, para a assinatura do webhook e para o pepper das âncoras,
    // isso é o vazamento inteiro em uma linha.
    const proibidos = ['NEXT_PUBLIC_MP_', 'NEXT_PUBLIC_BENEFICIOS_', 'NEXT_PUBLIC_RECONCILE'];
    const achados: string[] = [];
    for (const area of AREAS) {
      for (const arquivo of fontesEm(area)) {
        if (arquivo === ESTE_ARQUIVO) continue;
        const fonte = readFileSync(arquivo, 'utf8');
        for (const p of proibidos) {
          if (fonte.includes(p)) achados.push(`${path.relative(RAIZ, arquivo)}: ${p}`);
        }
      }
    }
    expect(achados, 'segredo de cobrança exposto ao navegador por prefixo NEXT_PUBLIC_').toEqual([]);
  });

  it('o módulo não guarda o token em escopo de módulo nem o exporta', () => {
    const fonte = readFileSync(MODULO_MP, 'utf8');
    // process.env.MP_ACCESS_TOKEN só pode aparecer DENTRO de função. Heurística
    // simples e suficiente: nenhuma linha de topo (sem indentação) o menciona.
    const noTopo = fonte
      .split(/\r?\n/)
      .filter((l) => /^(?:const|let|var|export)\s/.test(l) && l.includes('MP_ACCESS_TOKEN'));
    expect(noTopo, 'o token tem de ser lido dentro da função, não capturado no módulo').toEqual([]);
    expect(/export\s+(?:const|let|var)\s+\w*[Tt]oken/.test(fonte), 'não exporte o token').toBe(false);
  });

  it('nada loga o token: todo console do módulo passa por redação', () => {
    const fonte = readFileSync(MODULO_MP, 'utf8');
    const consoles = fonte.split(/\r?\n/).filter((l) => /console\.(log|warn|error|info|debug)/.test(l));
    const semRedacao = consoles.filter((l) => !l.includes('redigirSegredos') && !l.includes('resumoParaLog'));
    expect(semRedacao, 'console sem redação em módulo que manipula o Access Token').toEqual([]);
  });
});
