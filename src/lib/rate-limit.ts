// Rate limiting das rotas públicas — Upstash Redis (REST) via @upstash/ratelimit.
//
// PRINCÍPIO INEGOCIÁVEL: FAIL-OPEN. Indisponibilidade do Redis NUNCA pode virar
// indisponibilidade do app. Toda falha — credencial ausente, erro de rede,
// timeout — resulta em a requisição PASSAR. O rate limiter é proteção, não pode
// ser um novo ponto único de falha. Cada retorno { ok: true } de fallback está
// comentado como fail-open.
//
// Não bate no Postgres (a contagem vive no Redis) — de propósito: o mecanismo de
// proteção não pode virar parte do problema que deveria evitar.
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type RateDecision = { ok: true } | { ok: false; retryAfterSec: number; limit: number; scope: string };

// ---- Resolução do IP real ----------------------------------------------------
// Na Netlify o IP confiável é `x-nf-client-connection-ip` (a plataforma sobrescreve
// com o IP TCP real; não é falsificável). `x-forwarded-for` PODE ser forjado pelo
// cliente, então só usamos como fallback (primeiro hop). CONFIRMAR no modo observe
// qual header realmente aparece antes de confiar para valer.
export function resolveClientIp(headers: Headers): { ip: string; candidates: Record<string, string | null> } {
  const candidates = {
    'x-nf-client-connection-ip': headers.get('x-nf-client-connection-ip'),
    'x-forwarded-for': headers.get('x-forwarded-for'),
    'x-real-ip': headers.get('x-real-ip'),
  };
  const ip =
    candidates['x-nf-client-connection-ip'] ||
    candidates['x-forwarded-for']?.split(',')[0]?.trim() ||
    candidates['x-real-ip'] ||
    'unknown';
  return { ip, candidates };
}

// ---- Limiters (lazy) ---------------------------------------------------------
// Criados só na 1ª necessidade. Sem UPSTASH_REDIS_REST_URL/TOKEN => retorna null
// => fail-open. slidingWindow para a contagem zerar suavemente após a janela.
let cached: { publicGet: Ratelimit; quotePostMin: Ratelimit; quotePostHour: Ratelimit } | null = null;

function getLimiters() {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // sem credencial => fail-open
  const redis = new Redis({ url, token });
  cached = {
    // Público (leitura): 30/min.
    publicGet: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m'), prefix: 'rl:pub:get', analytics: false }),
    // Formulário público (POST /api/public/quote): 3/min E 10/hora.
    quotePostMin: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '1 m'), prefix: 'rl:quote:min', analytics: false }),
    quotePostHour: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h'), prefix: 'rl:quote:hour', analytics: false }),
  };
  return cached;
}

// rl.limit() com timeout: se o Redis demorar, não seguramos a resposta — fail-open.
async function limitWithTimeout(rl: Ratelimit, key: string, ms = 800) {
  try {
    return await Promise.race([
      rl.limit(key),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('rl-timeout')), ms)),
    ]);
  } catch {
    return null; // erro/timeout => fail-open (o chamador trata null como "passa")
  }
}

// ---- Decisão para uma rota pública ------------------------------------------
export async function checkPublicRateLimit(opts: { path: string; method: string; key: string }): Promise<RateDecision> {
  const limiters = getLimiters();
  if (!limiters) {
    console.warn('[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN ausentes — fail-open (requisição passa).');
    return { ok: true }; // fail-open: sem credencial, não bloqueia
  }

  const isQuotePost = opts.method === 'POST' && opts.path.startsWith('/api/public/quote');
  const checks = isQuotePost
    ? [
        { rl: limiters.quotePostMin, limit: 3, scope: 'quote-post/min' },
        { rl: limiters.quotePostHour, limit: 10, scope: 'quote-post/hour' },
      ]
    : [{ rl: limiters.publicGet, limit: 30, scope: 'public-get/min' }];

  for (const c of checks) {
    const res = await limitWithTimeout(c.rl, opts.key);
    if (res === null) {
      console.warn('[rate-limit] Redis indisponível/timeout — fail-open (requisição passa).');
      return { ok: true }; // fail-open: Redis fora do ar não derruba o app
    }
    if (!res.success) {
      const retryAfterSec = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
      return { ok: false, retryAfterSec, limit: c.limit, scope: c.scope };
    }
  }
  return { ok: true };
}
