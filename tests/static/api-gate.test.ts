import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
// O acesso é decidido por camadas, e cada rota pertence a uma. O risco do desenho
// é ESQUECER: uma rota nova nasce sem classificação e vira porta aberta, ou vira
// gate errado — um GET que exige assinatura tranca quem está nos 90 dias de
// guarda; um POST que só pede leitura deixa suspensa operar. Aqui a omissão vira
// erro de CI, e mudar a camada de uma rota passa a ser um ato visível no diff.

const API = path.join(RAIZ, 'src', 'app', 'api');

// 'autenticada_propria': valida a sessão INLINE, sem requireDecorator. Não é
// desleixo — são as rotas que precisam funcionar ANTES do aceite legal existir,
// e por isso não podem passar pelo gate que exige o aceite.
type Camada = 'publica' | 'autenticada' | 'autenticada_propria' | 'leitura' | 'operacao';

const HELPER: Record<'autenticada' | 'leitura' | 'operacao', string> = {
  autenticada: 'requireDecorator(',
  leitura: 'requireLeitura(',
  operacao: 'requireAssinaturaAtiva(',
};

// A classificação de TODA rota, com o motivo de cada exceção. Esta tabela é a
// decisão de negócio escrita em código: alterá-la aparece na revisão.
const CAMADAS: Record<string, { get?: Camada; escrita?: Camada; motivo?: string }> = {
  // --- CAMADA 0: pública. Não consulta assinatura, de propósito. -------------
  'public/decorator/[id]/route.ts': { get: 'publica', motivo: 'página pública da parceira' },
  'public/quote/[token]/route.ts': {
    get: 'publica', escrita: 'publica',
    motivo: 'a cliente final não deve nada: um link já enviado é compromisso assumido, e quebrá-lo puniria quem não atrasou. Criar link NOVO exige assinatura (quote-links)',
  },
  'legal/documents/route.ts': { get: 'publica', motivo: 'versões dos documentos; usada no cadastro, sem sessão' },
  'billing/webhook/route.ts': { escrita: 'publica', motivo: 'chamada pelo Mercado Pago; autentica por HMAC, não por sessão' },

  // --- CAMADA 1: autenticada. Precisa funcionar ANTES de haver assinatura. ---
  'decorators/me/route.ts': { get: 'autenticada_propria', escrita: 'autenticada_propria', motivo: 'perfil próprio: a tela precisa dele antes de conseguir assinar' },
  'legal/acceptances/route.ts': { get: 'autenticada_propria', escrita: 'autenticada_propria', motivo: 'é a própria rota de aceite' },
  'legal/decline/route.ts': { escrita: 'autenticada_propria', motivo: 'saída da recusa' },
  'billing/estado/route.ts': { get: 'autenticada', motivo: 'é o que a tela de assinatura lê' },
  'billing/subscribe/route.ts': { escrita: 'autenticada', motivo: 'é como se assina' },
  'billing/sync/route.ts': { escrita: 'autenticada', motivo: 'confirma o retorno do checkout' },
  'billing/cancelamento/route.ts': {
    get: 'autenticada', escrita: 'autenticada',
    motivo: 'quem está inadimplente ou já cancelou precisa conseguir abrir esta tela; exigir assinatura vigente para CANCELAR seria um beco',
  },
  'billing/oferta/route.ts': { escrita: 'autenticada', motivo: 'aceite da oferta: mesma razão do cancelamento' },
  'billing/saude/route.ts': { get: 'autenticada', motivo: 'batimento do job: o operador precisa ver de qualquer estado' },
  'billing/reconcile/route.ts': {
    escrita: 'publica',
    motivo: 'disparada pelo cron; autentica por segredo compartilhado, não por sessão — mesma lógica do webhook',
  },

  // --- CAMADAS 2 e 3: dados da decoradora. Ler é aberto a quem já assinou. ---
  'clients/route.ts': { get: 'leitura', escrita: 'operacao' },
  'party-events/route.ts': { get: 'leitura', escrita: 'operacao' },
  'party-events/[id]/route.ts': { escrita: 'operacao' },
  'inventory/route.ts': { get: 'leitura', escrita: 'operacao' },
  'inventory/[id]/route.ts': { escrita: 'operacao' },
  'kits/route.ts': { get: 'leitura', escrita: 'operacao' },
  'kits/[id]/route.ts': { escrita: 'operacao' },
  'orders/route.ts': { get: 'leitura', escrita: 'operacao' },
  'orders/[id]/cancel/route.ts': { escrita: 'operacao' },
  'orders/[id]/return/route.ts': { escrita: 'operacao' },
  'orders/availability/route.ts': { get: 'operacao', motivo: 'consulta, mas existe só para criar pedido' },
  'calendar/route.ts': { get: 'leitura' },
  'chats/route.ts': { get: 'leitura', escrita: 'operacao' },
  'promo-messages/route.ts': { get: 'leitura', escrita: 'operacao' },
  'quote-links/route.ts': { escrita: 'operacao', motivo: 'criar link novo é assumir compromisso: exige assinatura' },
  'decorators/route.ts': { get: 'leitura', escrita: 'operacao', motivo: 'vitrine do Marketplace, MAS também resolve nome nas telas de Clientes e Chat — gatear em operação quebraria a tela de quem está nos 90 dias de guarda' },
};

function rotas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const alvo = path.join(dir, nome);
    if (statSync(alvo).isDirectory()) return rotas(alvo);
    return nome === 'route.ts' ? [alvo] : [];
  });
}

const TODAS = rotas(API).map((f) => path.relative(API, f).split(path.sep).join('/'));

/** Qual helper cada método usa, lendo o bloco da função exportada. */
function helperPorMetodo(fonte: string): Record<string, string> {
  const achados: Record<string, string> = {};
  let metodo = '';
  for (const linha of fonte.split(/\r?\n/)) {
    const m = linha.match(/^export async function (GET|POST|PUT|DELETE|PATCH)\b/);
    if (m) metodo = m[1];
    for (const [camada, chamada] of Object.entries(HELPER)) {
      if (metodo && linha.includes(chamada)) achados[metodo] = camada;
    }
  }
  return achados;
}

describe('classificação das rotas em camadas', () => {
  it('toda rota está classificada', () => {
    const semClassificacao = TODAS.filter((rel) => !(rel in CAMADAS));
    expect(
      semClassificacao,
      `rota(s) sem camada declarada: ${semClassificacao.join(', ')}. Acrescente em CAMADAS ` +
      'dizendo se é pública, autenticada, de leitura ou de operação — e por quê.',
    ).toEqual([]);
  });

  it('a tabela não guarda rota que deixou de existir', () => {
    const fantasmas = Object.keys(CAMADAS).filter((rel) => !TODAS.includes(rel));
    expect(fantasmas, `classificação órfã: ${fantasmas.join(', ')}`).toEqual([]);
  });

  it('cada método usa o helper da sua camada', () => {
    const erros: string[] = [];
    for (const rel of TODAS) {
      const decl = CAMADAS[rel];
      if (!decl) continue;
      const fonte = readFileSync(path.join(API, rel), 'utf8');
      const usados = helperPorMetodo(fonte);

      for (const [metodo, camadaUsada] of Object.entries(usados)) {
        const esperada = metodo === 'GET' ? decl.get : decl.escrita;
        if (esperada === 'autenticada_propria') continue; // valida a sessão inline, de propósito
        if (esperada === 'publica') {
          erros.push(`${rel} ${metodo}: declarada pública mas chama ${camadaUsada}`);
        } else if (esperada && camadaUsada !== esperada) {
          erros.push(`${rel} ${metodo}: declarada '${esperada}' mas usa o helper de '${camadaUsada}'`);
        }
      }

      // Declarou camada com gate e o método não chama helper nenhum: porta aberta.
      for (const [metodo, camada] of [['GET', decl.get], ['ESCRITA', decl.escrita]] as const) {
        if (!camada || camada === 'publica' || camada === 'autenticada_propria') continue;
        const temMetodo = metodo === 'GET'
          ? /^export async function GET\b/m.test(fonte)
          : /^export async function (POST|PUT|DELETE|PATCH)\b/m.test(fonte);
        if (temMetodo && !Object.entries(usados).some(([m]) => (metodo === 'GET' ? m === 'GET' : m !== 'GET'))) {
          erros.push(`${rel} ${metodo}: declarada '${camada}' mas não chama helper de camada`);
        }
      }
    }
    expect(erros, `camada declarada e implementada divergem:\n  ${erros.join('\n  ')}`).toEqual([]);
  });

  it('a porta sem gate não voltou a existir', () => {
    const culpadas = TODAS.filter((rel) => readFileSync(path.join(API, rel), 'utf8').includes('getSessionDecoratorId'));
    expect(culpadas, `getSessionDecoratorId foi removido de propósito: ${culpadas.join(', ')}`).toEqual([]);
  });

  it('rota pública NÃO consulta assinatura — decisão consciente, não acidente', () => {
    // Um link de orçamento já enviado tem de continuar funcionando mesmo com a
    // decoradora inadimplente. Se alguém puser um gate aqui, quebra a cliente final.
    const publicas = Object.entries(CAMADAS)
      .filter(([, d]) => d.get === 'publica' || d.escrita === 'publica')
      .map(([rel]) => rel);
    // Procura o IDENTIFICADOR, não a chamada: `requireAssinaturaAtiva(` com
    // parêntese deixaria passar um import solto — e um import solto hoje é uma
    // chamada amanhã. Rota pública não deve nem MENCIONAR o gate de assinatura.
    const comGate = publicas.filter((rel) => {
      const fonte = readFileSync(path.join(API, rel), 'utf8');
      return fonte.includes('requireLeitura') || fonte.includes('requireAssinaturaAtiva');
    });
    expect(comGate, `rota pública passou a exigir assinatura: ${comGate.join(', ')}`).toEqual([]);
  });
});
