// Proxy do Next 16 (o antigo "middleware" — renomeado nesta versão; ver
// node_modules/next/dist/docs/.../proxy.md). Fase 1 do rate limiting: SÓ as rotas
// públicas (/api/public/*), que são as mais expostas por não exigirem login.
//
// Flag NEXT_PUBLIC_RATE_LIMIT_ENABLED (on/off) + RATE_LIMIT_MODE (observe|enforce):
//   desligado         — não faz nada.
//   ligado + observe  — loga IP + latência do Redis + o que FARIA, sem bloquear.
//   ligado (enforce)  — bloqueia (429 + Retry-After).
// Suba em observe, confirme o header do IP e a latência no log da Netlify, e só
// então mude para enforce.
import { NextResponse, type NextRequest } from 'next/server';
import { rateLimitEnabled, rateLimitObserveOnly } from '@/lib/feature-flags';
import { resolveClientIp, checkPublicRateLimit } from '@/lib/rate-limit';

// Só roda nas rotas públicas nesta fase. Sem matcher, o proxy rodaria em TODA
// requisição (inclusive assets) — aqui restringimos de propósito.
export const config = {
  matcher: ['/api/public/:path*'],
};

export async function proxy(request: NextRequest) {
  if (!rateLimitEnabled) return NextResponse.next();

  const path = request.nextUrl.pathname;
  const method = request.method;
  const { ip, candidates } = resolveClientIp(request.headers);

  // Mede a latência real da chamada ao Redis a partir do edge da Netlify (é o
  // número que importa; a medição local é só piso). Sai no log de observe/enforce.
  const t0 = Date.now();
  const decision = await checkPublicRateLimit({ path, method, key: ip });
  const redisMs = Date.now() - t0;

  // LOG DO IP + LATÊNCIA (fase de confirmação): você confere qual header traz o IP
  // real na Netlify e a latência edge→Redis ANTES de calibrar/confiar. Volume
  // público é baixíssimo, então logar cada requisição pública é barato.
  console.log(`[rate-limit] ${method} ${path} ip=${ip} redisMs=${redisMs} candidates=${JSON.stringify(candidates)}`);

  // OBSERVE: nunca bloqueia — só registra o que faria. Serve para validar o header
  // do IP, a latência e se algum tráfego legítimo bateria no limite.
  if (rateLimitObserveOnly) {
    if (!decision.ok) {
      console.warn(`[rate-limit] OBSERVE bloquearia ${method} ${path} ip=${ip} scope=${decision.scope} retryAfter=${decision.retryAfterSec}s`);
    }
    return NextResponse.next();
  }

  // ENFORCE
  if (decision.ok) return NextResponse.next();

  // Bloqueio logado (IP/rota/limite) para você acompanhar se barra gente legítima.
  console.warn(`[rate-limit] BLOCK ${method} ${path} ip=${ip} scope=${decision.scope} limit=${decision.limit} retryAfter=${decision.retryAfterSec}s`);
  return new NextResponse(
    JSON.stringify({ error: 'Muitas requisições. Tente novamente em instantes.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(decision.retryAfterSec),
        'X-RateLimit-Scope': decision.scope,
      },
    }
  );
}
