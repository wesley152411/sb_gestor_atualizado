import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import { PREFIXO_CORTESIA, ehCortesia } from '@/lib/assinatura-estado';

// POR QUE ESTE TESTE EXISTE
//
// A cortesia criou um estado que as telas não previam: assinatura viva, com
// acesso liberado, mas SEM contrapartida no Mercado Pago. A tela oferecia
// desconto de 99,90 sobre uma cobrança inexistente e o botão de cancelar batia
// num PUT em /preapproval/cortesia:… que voltava erro.
//
// A exigência que estas provas guardam: a correção vale para QUALQUER linha de
// cortesia, inclusive uma semeada daqui a seis meses. Por isso o reconhecimento
// é por PREFIXO num módulo puro compartilhado — não uma lista de ids, não uma
// checagem repetida em cada arquivo, e não algo que dependa de alguém lembrar.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

describe('ehCortesia reconhece a linha, não a conta', () => {
  it('reconhece qualquer id com o prefixo — hoje ou daqui a seis meses', () => {
    expect(ehCortesia(`${PREFIXO_CORTESIA}6bdc87d3-0cca-4d6a-a52b-d1e970ff85b7`)).toBe(true);
    expect(ehCortesia(`${PREFIXO_CORTESIA}qualquer-coisa-futura`)).toBe(true);
  });

  it('NÃO confunde com preapproval de verdade', () => {
    // Formato real do MP: 32 hex. Um falso positivo aqui faria uma assinatura
    // paga deixar de ser cancelável — pior que o bug que estamos consertando.
    expect(ehCortesia('2c9380849abc1f34019abd0e5c2e01a7')).toBe(false);
    expect(ehCortesia('pa_ret_1234')).toBe(false);
  });

  it('ausência de id não é cortesia', () => {
    expect(ehCortesia(null)).toBe(false);
    expect(ehCortesia(undefined)).toBe(false);
    expect(ehCortesia('')).toBe(false);
  });

  it('o prefixo é exato: nada de variação de caixa', () => {
    // Documenta o contrato. Quem semeia usa a constante; qualquer outra grafia
    // é engano e deve falhar alto, não ser aceita por gentileza.
    expect(ehCortesia('CORTESIA:abc')).toBe(false);
    expect(ehCortesia(' cortesia:abc')).toBe(false);
  });
});

describe('a definição mora em UM lugar', () => {
  it('o módulo puro é a fonte, e o job importa em vez de redefinir', () => {
    const puro = ler('src/lib/assinatura-estado.ts');
    const job = ler('src/lib/reconciliacao.ts');
    expect(puro).toMatch(/export const PREFIXO_CORTESIA = 'cortesia:'/);
    expect(job, 'redefinir o prefixo cria duas verdades que divergem no primeiro ajuste')
      .not.toMatch(/const PREFIXO_CORTESIA\s*=/);
    expect(job).toMatch(/ehCortesia/);
  });

  it('está em módulo PURO, alcançável pelas telas', () => {
    // Se migrasse para reconciliacao.ts (server-only), o cliente não poderia
    // importar e a checagem voltaria a ser duplicada na interface.
    // A checagem é da DIRETIVA, não da string: o arquivo cita 'server-only' em
    // comentário, e casar com a menção reprovaria por motivo errado.
    expect(ler('src/lib/assinatura-estado.ts')).not.toMatch(/^\s*import 'server-only'/m);
  });
});

describe('nenhum caminho de cortesia chega ao Mercado Pago', () => {
  const fonte = ler('src/lib/assinatura.ts');

  for (const funcao of ['cancelarAssinatura', 'aceitarOfertaRetencao']) {
    it(`${funcao} recusa a cortesia ANTES de chamar o MP`, () => {
      const inicio = fonte.indexOf(`export async function ${funcao}`);
      expect(inicio, `${funcao} não encontrada`).toBeGreaterThan(-1);
      const corpo = fonte.slice(inicio, fonte.indexOf('\nexport ', inicio + 1));

      const guarda = corpo.indexOf('ehCortesia');
      const chamada = corpo.indexOf('mpFetch');
      expect(guarda, `${funcao} não checa cortesia`).toBeGreaterThan(-1);
      expect(chamada, `${funcao} deveria chamar o MP no caminho normal`).toBeGreaterThan(-1);
      expect(guarda, `a guarda precisa vir ANTES do mpFetch, senão o erro do MP é que decide`)
        .toBeLessThan(chamada);
    });
  }

  it('estadoDoCancelamento não oferece retenção nem cancelamento para cortesia', () => {
    const inicio = fonte.indexOf('export async function estadoDoCancelamento');
    const corpo = fonte.slice(inicio, fonte.indexOf('\nexport ', inicio + 1));
    expect(corpo).toMatch(/const cortesia = ehCortesia/);
    expect(corpo, 'podeCancelar precisa excluir cortesia').toMatch(/podeCancelar:[^,]*!cortesia/);
    expect(corpo, 'ofereceRetencao precisa excluir cortesia').toMatch(/ofereceRetencao:[^,]*!cortesia/);
  });
});

describe('as telas não imprimem data vazia', () => {
  it('toda descrição de status tem versão sem data', () => {
    const pagina = ler('src/app/(dashboard)/assinatura/page.tsx');
    const bloco = pagina.slice(pagina.indexOf('const DESCRICAO'), pagina.indexOf('export default'));
    // O bug era `Próxima cobrança em ${dia(e.proxima_cobranca)}` sem guarda:
    // com data nula saía "Próxima cobrança em .". Cada data agora é condicional.
    for (const campo of ['proxima_cobranca', 'teste_fim', 'periodo_fim']) {
      const usos = bloco.split(`dia(e.${campo})`).length - 1;
      if (usos === 0) continue;
      expect(bloco, `${campo} é interpolado sem checar se existe`).toMatch(
        new RegExp(`e\\.${campo}\\s*\\n?\\s*\\?`),
      );
    }
  });

  it('a tela de cancelamento separa cortesia de assinatura encerrada', () => {
    const tela = ler('src/app/(dashboard)/assinatura/cancelar/page.tsx');
    expect(tela, 'os dois casos caem em podeCancelar=false por motivos opostos')
      .toMatch(/estado\?\.cortesia/);
    expect(tela).toMatch(/Não há cobrança a cancelar/);
  });
});
