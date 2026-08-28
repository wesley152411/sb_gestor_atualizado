import { describe, it, expect } from 'vitest';
import { api } from './helpers';
import { checkPublicRateLimit, resolveClientIp, __resetLimitersForTest } from '../src/lib/rate-limit';

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

// Anti-spoof da identidade (função pura, não precisa de Upstash — roda sempre).
// A Netlify acrescenta o IP real ao FINAL do x-forwarded-for; pegar a primeira
// entrada deixaria a chave falsificável. Confirmamos que usamos a última.
describe('resolveClientIp — anti-spoof do x-forwarded-for', () => {
  it('usa a ÚLTIMA entrada (a que a Netlify pôs), não a primeira forjada', () => {
    const h = new Headers({ 'x-forwarded-for': '66.66.66.66, 179.152.173.47' });
    expect(resolveClientIp(h).ip).toBe('179.152.173.47');
  });
  it('valor único no x-forwarded-for é usado como está', () => {
    expect(resolveClientIp(new Headers({ 'x-forwarded-for': '179.152.173.47' })).ip).toBe('179.152.173.47');
  });
  it('x-nf-client-connection-ip, quando presente, tem prioridade', () => {
    const h = new Headers({ 'x-nf-client-connection-ip': '10.0.0.1', 'x-forwarded-for': '1.2.3.4' });
    expect(resolveClientIp(h).ip).toBe('10.0.0.1');
  });
  it('sem nenhum header de IP, cai em "unknown"', () => {
    expect(resolveClientIp(new Headers()).ip).toBe('unknown');
  });
});

describe.skipIf(!hasUpstash)('Rate limiting — rotas públicas', () => {
  // Nota: o fail-open é REQUISITO — um hiccup do Redis faz a requisição passar sem
  // contar. Por isso NÃO exigimos que a Nª requisição exata seja 429 (frágil);
  // afirmamos que (a) dentro do limite passa e (b) acima do limite o 429 engata.
  it.skipIf(!enforcing)('GET público (30/min): dentro do limite passa; acima, 429 + Retry-After', async () => {
    const key = keyFor('get');
    expect((await getWith(key)).status, '1ª requisição deveria passar').not.toBe(429);
    // Bem acima de 30: o 429 tem de aparecer (tolerando fail-open ocasional).
    let blocked: Awaited<ReturnType<typeof getWith>> | null = null;
    for (let i = 0; i < 45 && !blocked; i++) {
      const r = await getWith(key);
      if (r.status === 429) blocked = r;
    }
    expect(blocked, 'nenhuma requisição foi 429 acima do limite de 30').not.toBeNull();
    expect(blocked!.headers.get('retry-after')).toBeTruthy();
  });

  it.skipIf(!enforcing)('POST do formulário público (3/min): dentro do limite passa; acima, 429 + Retry-After', async () => {
    const key = keyFor('post');
    expect((await postQuote(key)).status, '1º POST deveria passar').not.toBe(429);
    let blocked: Awaited<ReturnType<typeof postQuote>> | null = null;
    for (let i = 0; i < 12 && !blocked; i++) {
      const r = await postQuote(key);
      if (r.status === 429) blocked = r;
    }
    expect(blocked, 'nenhum POST foi 429 acima do limite de 3').not.toBeNull();
    expect(blocked!.headers.get('retry-after')).toBeTruthy();
  });

  // Teste REAL da janela: estoura, confirma 429, espera a janela de 1 min passar e
  // confirma que volta a passar. É o teste honesto de "zera após a janela" — sem
  // depender do formato interno de chave do @upstash/ratelimit. ~65s.
  it.skipIf(!enforcing)('a contagem zera após a janela de 1 min expirar', async () => {
    const key = keyFor('reset');
    // Estoura o limite até o 429 engatar (tolera fail-open ocasional).
    let got429 = false;
    for (let i = 0; i < 45 && !got429; i++) {
      if ((await getWith(key)).status === 429) got429 = true;
    }
    expect(got429, 'não consegui estourar o limite para testar o reset').toBe(true);
    // Passada a janela de 1 min, a contagem zera e volta a passar.
    await new Promise((r) => setTimeout(r, 65_000));
    expect((await getWith(key)).status).not.toBe(429);
  }, 95_000);

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
