import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
//
// A tela /assinatura ficou pronta e funcionando por três etapas SEM nenhum
// caminho até ela. O gate do servidor devolvia 402 SUBSCRIPTION_REQUIRED e
// nenhuma tela reagia: quem se cadastrava via o app inteiro vazio, sem erro e
// sem explicação, e ia embora achando que estava quebrado.
//
// O buraco era invisível porque tudo passava: rotas testadas, gate testado,
// telas renderizando. O que faltava era a LIGAÇÃO entre eles — exatamente o tipo
// de coisa que nenhum teste de unidade pega e que um refactor apaga sem avisar.
//
// Estas provas leem o código-fonte e falham se alguém desfizer a ligação.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

describe('quem nunca assinou é levado à assinatura', () => {
  const layout = ler('src/app/(dashboard)/layout.tsx');

  it('o layout do dashboard envolve o conteúdo no portão', () => {
    expect(layout, 'sem AssinaturaGate no layout, o app volta a abrir vazio para quem não assinou')
      .toMatch(/<AssinaturaGate>/);
    expect(layout).toMatch(/<\/AssinaturaGate>/);
  });

  const portao = ler('src/components/providers/AssinaturaGate.tsx');

  it('o portão reage a sem_assinatura E a pendente', () => {
    // 'pendente' é quem abriu o checkout e não concluiu: fica igualmente sem
    // acesso, e sem isto ficaria presa fora com uma tela normal e vazia.
    expect(portao).toMatch(/'sem_assinatura'/);
    expect(portao).toMatch(/'pendente'/);
  });

  it('o portão NÃO cobre as próprias telas de assinatura', () => {
    // Se cobrisse, o retorno do Mercado Pago (/assinatura/retorno) cairia no
    // portão e a assinatura recém-paga nunca seria confirmada na tela.
    expect(portao, 'o portão precisa liberar /assinatura* — é a saída dele')
      .toMatch(/pathname\.startsWith\('\/assinatura'\)/);
  });

  it('o portão deixa passar enquanto o estado carrega', () => {
    // Cobrir por padrão faria o app piscar um muro em TODA carga de página,
    // inclusive para quem paga em dia.
    expect(portao).toMatch(/!carregando/);
  });

  it('o portão oferece saída da conta — não é armadilha', () => {
    expect(portao, 'sem logout, quem não quer assinar fica presa numa tela só')
      .toMatch(/signOut/);
  });

  it('o portão diz que a cobrança é adiada, não que o mês grátis corre sozinho', () => {
    // O ponto que faz desistir é descobrir no Mercado Pago que precisa passar
    // cartão para "testar". A tela tem de dizer isso ANTES do redirect.
    expect(portao).toMatch(/primeira cobrança acontece só daqui a 30 dias/);
  });
});

describe('a assinatura é alcançável pela navegação', () => {
  it('Configurações tem um caminho para /assinatura', () => {
    const settings = ler('src/app/(dashboard)/settings/page.tsx');
    expect(settings, 'sem este link, uma assinante em dia não vê a própria assinatura')
      .toMatch(/href="\/assinatura"/);
  });
});

describe('a ação de assinar não é duplicada', () => {
  it('as duas telas usam o mesmo useAssinar', () => {
    const pagina = ler('src/app/(dashboard)/assinatura/page.tsx');
    const portao = ler('src/components/providers/AssinaturaGate.tsx');
    for (const [nome, fonte] of [['página', pagina], ['portão', portao]] as const) {
      expect(fonte, `${nome} deveria usar o hook compartilhado`).toMatch(/useAssinar\(\)/);
      expect(fonte, `${nome} não deve chamar /api/billing/subscribe por conta própria`)
        .not.toMatch(/fetch\('\/api\/billing\/subscribe'/);
    }
  });
});
