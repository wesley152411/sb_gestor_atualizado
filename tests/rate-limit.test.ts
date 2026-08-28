import { describe, it, expect } from 'vitest';
import { api } from './helpers';
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

// Chave ÚNICA por teste (e por execução) — o proxy usa o header
// x-nf-client-connection-ip como identidade. Assim cada teste tem seu próprio
// contador, sem interferência entre testes/execuções e sem tocar produção (o valor
// não é um IP real).
const RUN = Date.now();
const keyFor = (tag: string) => `rltest-${tag}-${RUN}`;
const H = (key: string, extra: Record<string, string> = {}) => ({ 'x-nf-client-connection-ip': key, ...extra });
const getWith = (key: string) => api('/api/public/decorator/x', null, { headers: H(key) });
const postQuote = (key: string) =>
  api('/api/public/quote/x', null, { method: 'POST', headers: H(key, { 'Content-Type': 'application/json' }), body: '{}' });

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
  it.skipIf(!enforcing)('GET público: as 30 primeiras passam; a 31ª é 429 + Retry-After', async () => {
    const key = keyFor('get');
    for (let i = 0; i < 30; i++) {
      const r = await getWith(key);
      expect(r.status, `req ${i} não deveria ser 429`).not.toBe(429);
    }
    const blocked = await getWith(key);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it.skipIf(!enforcing)('POST do formulário público: 3/min — o 4º envio é 429 + Retry-After', async () => {
    const key = keyFor('post');
    for (let i = 0; i < 3; i++) {
      const r = await postQuote(key);
      expect(r.status, `post ${i} não deveria ser 429`).not.toBe(429);
    }
    const blocked = await postQuote(key);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  // Teste REAL da janela: estoura, confirma 429, espera a janela de 1 min passar e
  // confirma que volta a passar. É o teste honesto de "zera após a janela" — sem
  // depender do formato interno de chave do @upstash/ratelimit. ~65s.
  it.skipIf(!enforcing)('a contagem zera após a janela de 1 min expirar', async () => {
    const key = keyFor('reset');
    for (let i = 0; i < 31; i++) await getWith(key);
    expect((await getWith(key)).status).toBe(429);
    await new Promise((r) => setTimeout(r, 65_000));
    expect((await getWith(key)).status).not.toBe(429);
  }, 85_000);

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
