import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Redis } from '@upstash/redis';
import { api, post } from './helpers';
import { checkPublicRateLimit, __resetLimitersForTest } from '../src/lib/rate-limit';

// Rate limiting das rotas públicas. Roda no job de CI `rate-limit`, que sobe o
// servidor com NEXT_PUBLIC_RATE_LIMIT_ENABLED=true (enforce) + credenciais Upstash.
// Sem Upstash no ambiente, o bloco inteiro é PULADO — assim o job de isolamento
// (rate limiting off) não é afetado.
const UP_URL = process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const hasUpstash = !!(UP_URL && UP_TOKEN);
const enforcing =
  process.env.NEXT_PUBLIC_RATE_LIMIT_ENABLED === 'true' &&
  (process.env.RATE_LIMIT_MODE || '').toLowerCase() !== 'observe';

// No job de CI `rate-limit` (RATE_LIMIT_JOB=1) as credenciais Upstash DEVEM existir.
// Sem elas, FALHA (não pula) — silêncio verde aqui é pior que vermelho.
it.runIf(process.env.RATE_LIMIT_JOB === '1')(
  'pré-condição: o job rate-limit tem credenciais Upstash e enforce ligado',
  () => {
    expect(hasUpstash, 'UPSTASH_REDIS_REST_URL/TOKEN ausentes no job rate-limit — configure os secrets').toBe(true);
    expect(enforcing, 'rate limiting não está em enforce no job rate-limit').toBe(true);
  }
);

describe.skipIf(!hasUpstash)('Rate limiting — rotas públicas', () => {
  let redis: Redis;
  beforeAll(() => {
    redis = new Redis({ url: UP_URL!, token: UP_TOKEN! });
  });

  // Limpa SÓ os contadores da identidade de teste. Em CI, o servidor não recebe
  // header de IP (localhost) e resolve para 'unknown'; usuários reais nunca são
  // 'unknown', então isto NÃO toca os contadores de produção mesmo compartilhando
  // o mesmo banco Upstash.
  async function flushTestKeys() {
    const keys = (await redis.keys('rl:*')).filter((k) => k.includes('unknown'));
    if (keys.length) await redis.del(...keys);
  }
  beforeEach(flushTestKeys);

  it.skipIf(!enforcing)('GET público: dentro do limite passa; o excedente retorna 429 + Retry-After', async () => {
    // 30/min. As 30 primeiras passam (rota responde 404, não 429); a 31ª é 429.
    for (let i = 0; i < 30; i++) {
      const r = await api('/api/public/decorator/nao-existe', null);
      expect(r.status, `req ${i} não deveria ser 429`).not.toBe(429);
    }
    const blocked = await api('/api/public/decorator/nao-existe', null);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it.skipIf(!enforcing)('POST do formulário público: 3/min — o 4º envio é 429 + Retry-After', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await post('/api/public/quote/nao-existe', null, {});
      expect(r.status, `post ${i} não deveria ser 429`).not.toBe(429);
    }
    const blocked = await post('/api/public/quote/nao-existe', null, {});
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it.skipIf(!enforcing)('a contagem zera após a janela expirar (simulada por limpeza dos contadores)', async () => {
    // Estoura, confirma 429, limpa (equivale à expiração da janela) e confirma que
    // volta a passar. O teste por relógio real (esperar 60s) fica atrás de
    // RUN_SLOW_RL=1 para não atrasar o CI.
    for (let i = 0; i < 31; i++) await api('/api/public/decorator/x', null);
    expect((await api('/api/public/decorator/x', null)).status).toBe(429);
    await flushTestKeys();
    expect((await api('/api/public/decorator/x', null)).status).not.toBe(429);
  });

  it.skipIf(process.env.RUN_SLOW_RL !== '1')('janela real: após 65s o GET volta a passar (lento — RUN_SLOW_RL=1)', async () => {
    for (let i = 0; i < 31; i++) await api('/api/public/decorator/y', null);
    expect((await api('/api/public/decorator/y', null)).status).toBe(429);
    await new Promise((r) => setTimeout(r, 65_000));
    expect((await api('/api/public/decorator/y', null)).status).not.toBe(429);
  }, 90_000);

  it('fail-open: sem credencial Upstash, a decisão é PASSAR (nível da lib)', async () => {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetLimitersForTest();
    try {
      const d = await checkPublicRateLimit({ path: '/api/public/quote/x', method: 'POST', key: '203.0.113.7' });
      expect(d.ok).toBe(true); // fail-open: sem Redis, passa
    } finally {
      if (url) process.env.UPSTASH_REDIS_REST_URL = url;
      if (token) process.env.UPSTASH_REDIS_REST_TOKEN = token;
      __resetLimitersForTest();
    }
  });
});
