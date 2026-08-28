// Proxy do Next 16 (o antigo "middleware" — renomeado nesta versão; ver
// node_modules/next/dist/docs/.../proxy.md). Fase 1 do rate limiting: SÓ as rotas
// públicas (/api/public/*), que são as mais expostas por não exigirem login.
//
// Flag NEXT_PUBLIC_RATE_LIMIT_ENABLED (on/off) + RATE_LIMIT_MODE (observe|enforce):
//   desligado         — não faz nada (mas ainda marca o header de diagnóstico).
//   ligado + observe  — loga IP + latência do Redis + o que FARIA, sem bloquear.
//   ligado (enforce)  — bloqueia (429 + Retry-After).
//
// DIAGNÓSTICO: toda requisição que casa o matcher recebe o header `x-ratelimit`
// na resposta, ANTES de qualquer decisão. Assim dá para confirmar por curl se o
// proxy está de fato executando na Netlify, sem depender de acessar os logs:
//   (sem header)        -> o proxy NÃO está rodando (adapter não reconheceu o proxy.ts)
//   x-ratelimit: disabled -> proxy roda, mas a flag não veio 'true' no build
//   x-ratelimit: observe  -> rodando em observe (+ x-ratelimit-ip / -redis-ms / -ipsrc)
//   x-ratelimit: enforce-pass / enforce-block -> rodando em enforce
import { NextResponse, type NextRequest } from 'next/server';
import { rateLimitEnabled, rateLimitObserveOnly } from '@/lib/feature-flags';
import { resolveClientIp, checkPublicRateLimit } from '@/lib/rate-limit';

export const config = {
  matcher: ['/api/public/:path*'],
};

// Passa adiante marcando o header de diagnóstico (e outros extras).
function pass(mark: string, extra?: Record<string, string>) {
  const res = NextResponse.next();
  res.headers.set('x-ratelimit', mark);
  if (extra) for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

export async function proxy(request: NextRequest) {
  if (!rateLimitEnabled) return pass('disabled');

  const path = request.nextUrl.pathname;
  const method = request.method;
  const { ip, candidates } = resolveClientIp(request.headers);
  const ipSource =
    candidates['x-nf-client-connection-ip'] ? 'x-nf-client-connection-ip'
    : candidates['x-forwarded-for'] ? 'x-forwarded-for'
    : candidates['x-real-ip'] ? 'x-real-ip'
    : 'none';

  // Mede a latência real edge→Redis (número que importa; a medição local é só piso).
  const t0 = Date.now();
  const decision = await checkPublicRateLimit({ path, method, key: ip });
  const redisMs = Date.now() - t0;

  // Log (Edge Functions logs na Netlify) + headers de diagnóstico na resposta.
  console.log(`[rate-limit] ${method} ${path} ip=${ip} ipsrc=${ipSource} redisMs=${redisMs} candidates=${JSON.stringify(candidates)}`);
  const diag = { 'x-ratelimit-ip': ip, 'x-ratelimit-ipsrc': ipSource, 'x-ratelimit-redis-ms': String(redisMs) };

  // OBSERVE: nunca bloqueia — só registra. Serve para validar o header do IP, a
  // latência e se algum tráfego legítimo bateria no limite.
  if (rateLimitObserveOnly) {
    if (!decision.ok) {
      console.warn(`[rate-limit] OBSERVE bloquearia ${method} ${path} ip=${ip} scope=${decision.scope} retryAfter=${decision.retryAfterSec}s`);
    }
    return pass('observe', diag);
  }

  // ENFORCE
  if (decision.ok) return pass('enforce-pass', diag);

  console.warn(`[rate-limit] BLOCK ${method} ${path} ip=${ip} ipsrc=${ipSource} scope=${decision.scope} limit=${decision.limit} retryAfter=${decision.retryAfterSec}s`);
  return new NextResponse(
    JSON.stringify({ error: 'Muitas requisições. Tente novamente em instantes.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(decision.retryAfterSec),
        'x-ratelimit': 'enforce-block',
        'X-RateLimit-Scope': decision.scope,
      },
    }
  );
}
