import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  extrairAssinatura,
  montarManifesto,
  calcularHash,
  hashConfere,
  validarAssinatura,
  tipoDoEvento,
  chaveDoEvento,
  JANELA_SEGUNDOS,
} from '@/lib/webhook-mp';

// Esta validação é o que separa "o Mercado Pago disse" de "alguém disse". Sem ela,
// quem descobrir a URL do webhook libera acesso pago mandando um POST.

const SEGREDO = '6d668d79'.repeat(8); // 64 hex, o formato do MP_WEBHOOK_SECRET
const AGORA = new Date('2026-09-06T12:00:00Z');
const TS = String(Math.floor(AGORA.getTime() / 1000));
const DATA_ID = '4f6b7a169a9c4da69c7ef52df623fd2a';
const REQ_ID = 'a1b2c3d4-0000-4444-8888-abcdefabcdef';

function assinar(dataId = DATA_ID, requestId = REQ_ID, ts = TS, segredo = SEGREDO) {
  const v1 = createHmac('sha256', segredo).update(montarManifesto(dataId, requestId, ts), 'utf8').digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('manifesto', () => {
  it('tem formato exato, inclusive o ponto-e-vírgula final', () => {
    // Qualquer desvio aqui muda o hash e derruba TODA notificação — vale fixar.
    expect(montarManifesto('abc', 'req-1', '123')).toBe('id:abc;request-id:req-1;ts:123;');
  });

  it('request-id ausente vira string vazia, não "undefined"', () => {
    expect(montarManifesto('abc', '', '123')).toBe('id:abc;request-id:;ts:123;');
  });
});

describe('header x-signature', () => {
  it('extrai ts e v1', () => {
    expect(extrairAssinatura('ts=1704908010,v1=deadbeef')).toEqual({ ts: '1704908010', v1: 'deadbeef' });
  });

  it('tolera espaços e ordem trocada', () => {
    expect(extrairAssinatura(' v1=deadbeef , ts=17049 ')).toEqual({ ts: '17049', v1: 'deadbeef' });
  });

  it('recusa header ausente ou incompleto', () => {
    expect(extrairAssinatura(null)).toBeNull();
    expect(extrairAssinatura('ts=123')).toBeNull();
    expect(extrairAssinatura('v1=abc')).toBeNull();
  });
});

describe('comparação de hash', () => {
  it('aceita igual e recusa diferente', () => {
    const h = calcularHash('id:a;request-id:b;ts:1;', SEGREDO);
    expect(hashConfere(h, h)).toBe(true);
    expect(hashConfere(h, h.replace(/.$/, h.endsWith('0') ? '1' : '0'))).toBe(false);
  });

  it('recusa tamanhos diferentes sem estourar', () => {
    // timingSafeEqual lança com tamanhos diferentes; a checagem tem de vir antes.
    expect(() => hashConfere('aabb', 'aa')).not.toThrow();
    expect(hashConfere('aabb', 'aa')).toBe(false);
    expect(hashConfere('', '')).toBe(false);
  });
});

describe('validação completa', () => {
  const base = { requestId: REQ_ID, dataId: DATA_ID, segredo: SEGREDO, agora: AGORA };

  it('aceita uma notificação legítima', () => {
    const r = validarAssinatura({ ...base, header: assinar() });
    expect(r.valido).toBe(true);
  });

  it('RECUSA assinatura forjada — o caso que a rota existe para barrar', () => {
    const r = validarAssinatura({ ...base, header: `ts=${TS},v1=${'0'.repeat(64)}` });
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe('hash_diferente');
  });

  it('RECUSA assinatura de outro segredo', () => {
    const r = validarAssinatura({ ...base, header: assinar(DATA_ID, REQ_ID, TS, 'segredo-de-outra-aplicacao') });
    expect(r.valido).toBe(false);
  });

  it('RECUSA quando o data.id não é o assinado (não dá para reapontar a notificação)', () => {
    const r = validarAssinatura({ ...base, dataId: 'outro-recurso', header: assinar() });
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe('hash_diferente');
  });

  it('RECUSA replay: assinatura válida, mas velha', () => {
    const velho = String(Math.floor(AGORA.getTime() / 1000) - JANELA_SEGUNDOS - 60);
    const r = validarAssinatura({ ...base, header: assinar(DATA_ID, REQ_ID, velho) });
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe('expirado');
  });

  it('aceita ts em milissegundos (o MP varia entre s e ms)', () => {
    const ms = String(AGORA.getTime());
    const r = validarAssinatura({ ...base, header: assinar(DATA_ID, REQ_ID, ms) });
    expect(r.valido).toBe(true);
  });

  it('sem segredo configurado, recusa em vez de aceitar tudo', () => {
    const r = validarAssinatura({ ...base, segredo: undefined, header: assinar() });
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe('sem_segredo');
  });

  it('sem data.id, recusa', () => {
    const r = validarAssinatura({ ...base, dataId: null, header: assinar() });
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe('sem_data_id');
  });
});

describe('tipo e chave do evento', () => {
  it('reconhece os tópicos que nos interessam', () => {
    expect(tipoDoEvento({ type: 'subscription_preapproval' })).toBe('subscription_preapproval');
    expect(tipoDoEvento({ type: 'subscription_authorized_payment' })).toBe('subscription_authorized_payment');
    expect(tipoDoEvento({ topic: 'payment' })).toBe('payment');
  });

  it('tópico novo do MP não quebra — vira desconhecido', () => {
    expect(tipoDoEvento({ type: 'algo_que_o_mp_inventou' })).toBe('desconhecido');
    expect(tipoDoEvento({})).toBe('desconhecido');
  });

  it('a chave é o id da notificação — é ele que se repete na retentativa', () => {
    expect(chaveDoEvento({ id: 123456, type: 'x' })).toBe('123456');
  });

  it('sem id, deriva algo estável em vez de gerar chave nova a cada retentativa', () => {
    const corpo = { type: 'subscription_preapproval', action: 'updated', data: { id: 'pa_1' } };
    expect(chaveDoEvento(corpo)).toBe(chaveDoEvento({ ...corpo }));
    expect(chaveDoEvento(corpo)).toContain('pa_1');
  });
});
