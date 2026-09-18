import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import {
  ASSUNTOS_SUPORTE, CARINHAS, EMAIL_SUPORTE, FAQ_SUPORTE, LIMITE_MENSAGEM, rotuloDaNota,
} from '@/lib/suporte';

// POR QUE ESTE TESTE EXISTE
//
// A aba de Suporte nasceu de um print, e a spec foi explícita sobre DUAS coisas
// que o print mostra e o sistema NÃO tem:
//
//   1) a faixa de estatísticas do rodapé (tempo médio de resposta, satisfação,
//      notificações) — riscada de vermelho, porque os números não existem;
//   2) as respostas do FAQ — o print está com o acordeão fechado, então o texto
//      certo nunca foi escrito. "Não invente as respostas."
//
// As duas são fáceis de violar sem querer: qualquer um que olhe o print de novo
// pode "completar" a tela de boa fé. Aqui a regra vira erro de CI.
//
// A terceira propriedade guardada é a do critério de conclusão: a opinião tem de
// ser GRAVADA. Um formulário que só agradece na tela passa em qualquer revisão
// visual e falha no único requisito que a dona pediu por escrito.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');
const pagina = ler('src/app/(dashboard)/suporte/page.tsx');
const rota = ler('src/app/api/suporte/feedback/route.ts');
const barra = ler('src/components/layout/Sidebar.tsx');

describe('o que o print mostra e o sistema não tem', () => {
  it('a faixa de estatísticas NÃO foi implementada', () => {
    // Os rótulos e os números do print, exatamente como apareciam.
    for (const fixo of [
      'Tempo médio de resposta', 'Satisfação', 'Notificações no Mês',
      '32 min', '97,4%', '98,4%',
    ]) {
      expect(pagina, `"${fixo}" é a faixa riscada no print: não temos esse número`).not.toContain(fixo);
    }
  });

  it('nenhuma resposta de FAQ foi inventada', () => {
    // A regra não é "hoje está vazio", é "só entra resposta escrita por gente".
    // Quando a dona mandar os textos, este teste continua valendo para as que
    // ainda estiverem pendentes.
    for (const item of FAQ_SUPORTE) {
      if (item.resposta === null) continue;
      expect(
        item.resposta.trim().length,
        `a resposta de "${item.pergunta}" está vazia: ou tem texto de verdade, ou fica null`,
      ).toBeGreaterThan(0);
    }
  });

  it('pergunta sem resposta mostra o aviso, em vez de fingir', () => {
    expect(pagina).toMatch(/Resposta em breve/);
    expect(pagina).toMatch(/item\.resposta \?/);
  });

  it('não há selo de presença ("Online") sem sinal por trás', () => {
    // Mesmo motivo da faixa: é um número/estado que ninguém mede.
    expect(pagina).not.toMatch(/>\s*Online\s*</);
  });
});

describe('os textos vêm do print, e são os combinados', () => {
  it('as três perguntas do FAQ são exatamente as do print', () => {
    expect(FAQ_SUPORTE.map((f) => f.pergunta)).toEqual([
      'Como duplicar um orçamento de festa?',
      'Como bloquear peças para manutenção?',
      'Como enviar uma proposta com minha paleta de cores?',
    ]);
  });

  it('as cinco carinhas têm os rótulos do print, de 1 a 5', () => {
    expect(CARINHAS.map((c) => c.rotulo)).toEqual(['Péssimo', 'Ruim', 'Regular', 'Muito Bom', 'Incrível']);
    expect(CARINHAS.map((c) => c.nota)).toEqual([1, 2, 3, 4, 5]);
  });

  it('os quatro chips de assunto são os do print', () => {
    expect([...ASSUNTOS_SUPORTE]).toEqual([
      'Acervo de Peças', 'Modelo de Proposta', 'Frete e Logística', 'Controle de Aluguel',
    ]);
  });

  it('o e-mail de suporte é o oficial', () => {
    expect(EMAIL_SUPORTE).toBe('sbgestor2@gmail.com');
  });

  it('o rótulo da nota não inventa valor fora da escala', () => {
    expect(rotuloDaNota(5)).toBe('Incrível');
    expect(rotuloDaNota(1)).toBe('Péssimo');
    expect(rotuloDaNota(null)).toBeNull();
    expect(rotuloDaNota(9)).toBeNull();
  });
});

describe('a opinião é gravada, não só agradecida', () => {
  it('a tela envia para a rota de feedback', () => {
    expect(pagina).toMatch(/fetch\('\/api\/suporte\/feedback'/);
    expect(pagina).toMatch(/tipo: 'opiniao'/);
  });

  it('a rota escreve na tabela', () => {
    expect(rota).toMatch(/prisma\.supportFeedback\.create/);
  });

  it('o dono da linha vem da SESSÃO, nunca do corpo', () => {
    // Aceitar decorator_id do corpo deixaria qualquer conta gravar em nome de
    // outra. É o mesmo cuidado das outras rotas privadas.
    expect(rota).toMatch(/decorator_id: acesso\.decoratorId/);
    expect(rota).not.toMatch(/decorator_id: corpo\./);
  });

  it('o teto de caracteres é o MESMO na tela e no servidor', () => {
    // Validar só no maxLength do textarea não vale nada: um POST direto passa.
    expect(LIMITE_MENSAGEM).toBe(1000);
    expect(pagina).toMatch(/maxLength=\{LIMITE_MENSAGEM\}/);
    expect(rota).toMatch(/mensagem\.length > LIMITE_MENSAGEM/);
  });

  it('opinião vazia não vira linha no banco', () => {
    expect(rota).toMatch(/tipo === 'opiniao' && !mensagem/);
  });

  it('a nota é validada no servidor, e não só pelo CHECK do banco', () => {
    expect(rota).toMatch(/nota < 1 \|\| nota > 5/);
  });
});

describe('a aba existe no menu', () => {
  it('o item Suporte leva para /suporte, e não para lugar nenhum', () => {
    expect(barra, 'o link do Suporte voltou a ser href="#"').not.toMatch(/href="#"/);
    expect(barra).toMatch(/href="\/suporte"/);
  });

  it('o item fica marcado quando a aba está aberta', () => {
    expect(barra).toMatch(/const suporteAtivo = pathname\.startsWith\('\/suporte'\)/);
    expect(barra).toMatch(/aria-current=\{suporteAtivo \? 'page' : undefined\}/);
  });
});

describe('o canal de recado não depende de a assinatura estar em dia', () => {
  it('a rota usa o gate autenticado, e não o de assinatura', () => {
    // Quem está suspensa por falta de pagamento é quem mais precisa falar com o
    // suporte. Gatear aqui em leitura/operação fecharia a saída do problema.
    expect(rota).toMatch(/requireDecorator\(/);
    expect(rota).not.toMatch(/requireLeitura|requireAssinaturaAtiva/);
  });
});
