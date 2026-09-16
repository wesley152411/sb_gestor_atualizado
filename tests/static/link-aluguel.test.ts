import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import {
  TIPO_LINK, ehTipoLink, instanteDoCampo, campoDoInstante, formatarDataHora,
  diaDoInstante, validarPeriodo, periodoDoAluguel,
} from '@/lib/aluguel';
import { EVENT_STATUS, showsInCalendar } from '@/lib/event-status';

// POR QUE ESTE TESTE EXISTE
//
// O link para a cliente passou a ter dois tipos. No ALUGUEL, a cliente leva a
// peça e devolve depois, e quem define retirada e devolução é a DECORADORA, ao
// gerar o link — a cliente lê e não edita. Três coisas podem quebrar calado:
//
//  1. FUSO. Os campos de data e hora do navegador não têm fuso. Se a conversão
//     escorregar, a retirada muda de dia e o Calendário mente.
//  2. AUTORIDADE. Se o POST público passar a aceitar retirada/devolucao, a
//     cliente reescreve o combinado com um envio forjado.
//  3. ESTOQUE. Enquanto a peça está na casa da cliente ela NÃO está livre. Se o
//     motor de disponibilidade ignorar o aluguel, o sistema aluga duas vezes.
//
// A migração já foi aplicada e provada no banco de TESTE (o CHECK recusa aluguel
// sem datas, devolução <= retirada e decoração com datas). Aqui ficam as regras
// que vivem no código.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

describe('datas do aluguel: sempre no horário de Brasília', () => {
  it('o campo do navegador vira instante no fuso certo (-03:00)', () => {
    const d = instanteDoCampo('2026-09-20T14:30');
    expect(d?.toISOString()).toBe('2026-09-20T17:30:00.000Z');
    // E a prova que NÃO depende do fuso de quem roda o teste: comparada com a
    // leitura ingênua em UTC, a diferença tem de ser exatamente as 3 horas de
    // Brasília. Sem isto, tirar o fuso fixo do código passaria batido numa
    // máquina brasileira e só quebraria no servidor.
    const ingenuo = Date.parse('2026-09-20T14:30:00Z');
    expect(d!.getTime() - ingenuo).toBe(3 * 60 * 60 * 1000);
  });

  it('e volta para o campo sem escorregar de dia', () => {
    expect(campoDoInstante('2026-09-20T17:30:00.000Z')).toBe('2026-09-20T14:30');
    // 23h em Brasília já é o dia seguinte em UTC: o dia mostrado é o daqui.
    expect(campoDoInstante('2026-09-21T02:00:00.000Z')).toBe('2026-09-20T23:00');
    expect(diaDoInstante('2026-09-21T02:00:00.000Z')).toBe('2026-09-20');
  });

  it('campo vazio ou pela metade não vira data', () => {
    expect(instanteDoCampo('')).toBeNull();
    expect(instanteDoCampo('2026-09-20')).toBeNull();
    expect(campoDoInstante('')).toBe('');
  });

  it('a cliente lê dia e hora, não um ISO', () => {
    expect(formatarDataHora('2026-09-20T17:30:00.000Z')).toBe('20/09/2026 às 14:30');
  });
});

describe('o período do aluguel', () => {
  const agora = new Date('2026-09-20T12:00:00-03:00');
  const campo = (v: string) => instanteDoCampo(v);

  it('aceita retirada antes da devolução', () => {
    expect(validarPeriodo(campo('2026-09-21T10:00'), campo('2026-09-23T18:00'), agora)).toBe('');
  });

  it('exige as duas', () => {
    expect(validarPeriodo(campo('2026-09-21T10:00'), null, agora)).toMatch(/retirada e da devolução/);
    expect(validarPeriodo(null, campo('2026-09-23T18:00'), agora)).toMatch(/retirada e da devolução/);
  });

  it('recusa devolução antes ou igual à retirada', () => {
    expect(validarPeriodo(campo('2026-09-23T10:00'), campo('2026-09-21T10:00'), agora)).toMatch(/depois da retirada/);
    expect(validarPeriodo(campo('2026-09-23T10:00'), campo('2026-09-23T10:00'), agora)).toMatch(/depois da retirada/);
  });

  it('recusa retirada em dia passado, mas aceita mais cedo HOJE', () => {
    expect(validarPeriodo(campo('2026-09-19T10:00'), campo('2026-09-25T10:00'), agora)).toMatch(/data passada/);
    expect(validarPeriodo(campo('2026-09-20T08:00'), campo('2026-09-25T10:00'), agora)).toBe('');
  });

  it('periodoDoAluguel só devolve intervalo de link de aluguel completo', () => {
    expect(periodoDoAluguel({ tipo_link: TIPO_LINK.DECORACAO, retirada_em: '2026-09-21T13:00:00Z', devolucao_em: '2026-09-23T13:00:00Z' })).toBeNull();
    expect(periodoDoAluguel({ tipo_link: TIPO_LINK.ALUGUEL, retirada_em: null, devolucao_em: null })).toBeNull();
    expect(periodoDoAluguel({ tipo_link: TIPO_LINK.ALUGUEL, retirada_em: '2026-09-21T13:00:00Z', devolucao_em: '2026-09-23T13:00:00Z' })).not.toBeNull();
  });

  it('tipo inventado não é tipo de link', () => {
    expect(ehTipoLink('aluguel')).toBe(true);
    expect(ehTipoLink('decoracao')).toBe(true);
    expect(ehTipoLink('outro')).toBe(false);
  });
});

describe('Calendário: só depois de Confirmado', () => {
  const data = '2026-12-31'; // futuro, para não virar Finalizado por data

  it('aguardando confirmação NÃO aparece mais', () => {
    expect(showsInCalendar({ status: EVENT_STATUS.AGUARDANDO_CONFIRMACAO, event_date: data })).toBe(false);
  });

  it('rascunho e cancelado seguem fora', () => {
    expect(showsInCalendar({ status: EVENT_STATUS.AGUARDANDO_PREENCHIMENTO, event_date: data })).toBe(false);
    expect(showsInCalendar({ status: EVENT_STATUS.CANCELADO, event_date: data })).toBe(false);
  });

  it('confirmado aparece — e continua aparecendo depois que a data passa', () => {
    expect(showsInCalendar({ status: EVENT_STATUS.CONFIRMADO, event_date: data })).toBe(true);
    expect(showsInCalendar({ status: EVENT_STATUS.CONFIRMADO, event_date: '2020-01-01' })).toBe(true);
  });
});

describe('quem pode definir o período: só a decoradora', () => {
  const rotaLink = ler('src/app/api/quote-links/route.ts');
  const rotaPublica = ler('src/app/api/public/quote/[token]/route.ts');

  it('a rota que CRIA o link valida o período no servidor', () => {
    expect(rotaLink).toMatch(/const problema = validarPeriodo\(retirada, devolucao\);/);
    expect(rotaLink).toMatch(/if \(!ehTipoLink\(tipo\)\)/);
    expect(rotaLink).toMatch(/tipo_link: tipo,\s*retirada_em: retirada,\s*devolucao_em: devolucao,/);
  });

  it('o POST público NÃO escreve tipo, retirada nem devolução', () => {
    const post = rotaPublica.slice(rotaPublica.indexOf('export async function POST'));
    // Sem comentários: o próprio POST explica, em comentário, que NÃO escreve
    // esses campos — o que vale é não existir código escrevendo.
    const semComentarios = post
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(semComentarios).not.toMatch(/tipo_link|retirada_em|devolucao_em/);
  });

  it('mas o GET público DEVOLVE os três, para a cliente ler', () => {
    const get = rotaPublica.slice(rotaPublica.indexOf('export async function GET'), rotaPublica.indexOf('export async function POST'));
    expect(get).toMatch(/tipo_link: quote\.tipo_link/);
    expect(get).toMatch(/retirada_em: quote\.retirada_em/);
    expect(get).toMatch(/devolucao_em: quote\.devolucao_em/);
  });

  it('na tela da cliente o período é leitura, nunca campo', () => {
    const pagina = ler('src/app/orcamento/[token]/page.tsx');
    expect(pagina).toMatch(/<ReadRow label="Retirar em" value=\{formatarDataHora\(quote\.retirada_em\)\} \/>/);
    expect(pagina).toMatch(/<ReadRow label="Devolver em" value=\{formatarDataHora\(quote\.devolucao_em\)\} \/>/);
    expect(pagina, 'nenhum input escreve o período').not.toMatch(/setForm\(\{ \.\.\.form, (retirada|devolucao)/);
  });
});

describe('a peça fica bloqueada o período todo', () => {
  it('o motor de disponibilidade conta o aluguel confirmado', () => {
    const motor = ler('src/lib/rental-availability.ts');
    expect(motor).toMatch(/tx\.partyEvent\.findMany\(\{/);
    expect(motor).toMatch(/tipo_link: TIPO_LINK\.ALUGUEL,\s*status: EVENT_STATUS\.CONFIRMADO,/);
    // Sobreposição: começa antes do fim pedido E termina depois do início pedido.
    expect(motor).toMatch(/retirada_em: \{ lte: fimDoDiaBR\(ret\) \},\s*devolucao_em: \{ gte: inicioDoDiaBR\(pickup\) \},/);
  });

  it('o Acervo avisa que a peça está fora, com o período', () => {
    const acervo = ler('src/app/(dashboard)/inventory/page.tsx');
    expect(acervo).toMatch(/ev\.tipo_link !== TIPO_LINK\.ALUGUEL \|\| ev\.status !== EVENT_STATUS\.CONFIRMADO/);
    expect(acervo, 'aluguel já devolvido não bloqueia').toMatch(/new Date\(ev\.devolucao_em\)\.getTime\(\) < agora/);
    expect(acervo).toMatch(/pickup: diaDoInstante\(ev\.retirada_em\)/);
  });
});

describe('Calendário e Acervo mostram retirada e devolução', () => {
  const calendario = ler('src/app/(dashboard)/calendar/page.tsx');

  it('cada aluguel vira dois compromissos, um por dia', () => {
    expect(calendario).toMatch(/\[diaDoInstante\(e\.retirada_em\), 'pickup'\]/);
    expect(calendario).toMatch(/\[diaDoInstante\(e\.devolucao_em\), 'return'\]/);
    expect(calendario).toMatch(/getBucket\(dia\)\.alugueis\.push\(\{ event: e, kind \}\)/);
  });

  it('o detalhe do dia diz o que fazer e a que horas', () => {
    expect(calendario).toMatch(/retira \$\{a\.event\.theme/);
    expect(calendario).toMatch(/devolve \$\{a\.event\.theme/);
    expect(calendario).toMatch(/quando=\{formatarDataHora\(/);
  });

  it('a API do mês traz os aluguéis que retiram ou devolvem nele', () => {
    const rota = ler('src/app/api/calendar/route.ts');
    expect(rota).toMatch(/tipo_link: TIPO_LINK\.ALUGUEL, retirada_em: \{ gte: folgaInicio, lt: folgaFim \}/);
    expect(rota).toMatch(/tipo_link: TIPO_LINK\.ALUGUEL, devolucao_em: \{ gte: folgaInicio, lt: folgaFim \}/);
  });
});

describe('a escolha do tipo na Minha Página', () => {
  const minha = ler('src/app/(dashboard)/marketplace/my-page/page.tsx');

  it('o botão do item abre a escolha, em vez de gerar o link direto', () => {
    expect(minha).toMatch(/onClick=\{\(\) => abrirModalDeLink\(item\)\}/);
    expect(minha).not.toMatch(/handleSendLink/);
  });

  it('as duas opções existem e só o aluguel pede o período', () => {
    expect(minha).toMatch(/\[TIPO_LINK\.DECORACAO, TIPO_LINK\.ALUGUEL\]/);
    expect(minha).toMatch(/\{tipoLink === TIPO_LINK\.ALUGUEL && \(/);
    expect(minha).toMatch(/type="datetime-local"[\s\S]*?label="Retirada"/);
    expect(minha).toMatch(/type="datetime-local"[\s\S]*?label="Devolução"/);
  });

  it('a tela valida antes de chamar o servidor, e só manda o período no aluguel', () => {
    expect(minha).toMatch(/const problema = validarPeriodo\(instanteDoCampo\(retirada\), instanteDoCampo\(devolucao\)\);/);
    expect(minha).toMatch(/ehAluguel \? \{ tipo: TIPO_LINK\.ALUGUEL, retirada, devolucao \} : undefined,/);
  });
});

describe('a migração e o schema contam a mesma história', () => {
  const sql = ler('supabase/migrations/20260915120000_link_aluguel.sql');
  const schema = ler('prisma/schema.prisma');

  it('as três colunas existem nos dois lugares', () => {
    for (const coluna of ['tipo_link', 'retirada_em', 'devolucao_em']) {
      expect(sql, `${coluna} na migração`).toMatch(new RegExp(coluna));
      expect(schema, `${coluna} no schema`).toMatch(new RegExp(coluna));
    }
    expect(schema).toMatch(/tipo_link\s+String\s+@default\("decoracao"\)/);
  });

  it('a regra do período está no BANCO, não só na tela', () => {
    expect(sql).toMatch(/CHECK \(\s*\(tipo_link = 'decoracao' AND retirada_em IS NULL AND devolucao_em IS NULL\)/);
    expect(sql).toMatch(/devolucao_em > retirada_em/);
  });
});
