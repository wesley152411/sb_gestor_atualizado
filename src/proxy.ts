// Proxy do Next 16 (o antigo "middleware" — renomeado nesta versão; ver
// node_modules/next/dist/docs/.../proxy.md). Fase 1 do rate limiting: SÓ as rotas
// públicas (/api/public/*), que são as mais expostas por não exigirem login.
//
// Rollout em fases pelo RATE_LIMIT_MODE (ver src/lib/feature-flags.ts):
//   off     — não faz nada.
//   observe — loga o IP e o que FARIA, sem bloquear. Use primeiro para confirmar
//             qual header traz o IP real na Netlify.
//   enforce — bloqueia (429 + Retry-After).
import { NextResponse, type NextRequest } from 'next/server';
import { rateLimitMode } from '@/lib/feature-flags';
import { resolveClientIp, checkPublicRateLimit } from '@/lib/rate-limit';

// Só roda nas rotas públicas nesta fase. Sem matcher, o proxy rodaria em TODA
// requisição (inclusive assets) — aqui restringimos de propósito.
export const config = {
  matcher: ['/api/public/:path*'],
};

export async function proxy(request: NextRequest) {
  if (rateLimitMode === 'off') return NextResponse.next();

  const path = request.nextUrl.pathname;
  const method = request.method;
  const { ip, candidates } = resolveClientIp(request.headers);

  // LOG DO HEADER DE IP (fase de confirmação): imprime os candidatos para você ver
  // qual traz o IP real na Netlify ANTES de calibrar/confiar. Volume público é
  // baixíssimo (≈1 escrita/semana), então logar cada requisição pública é barato.
  console.log(`[rate-limit] ${method} ${path} ip=${ip} candidates=${JSON.stringify(candidates)}`);

  const decision = await checkPublicRateLimit({ path, method, key: ip });

  // OBSERVE: nunca bloqueia — só registra o que faria. Serve para você validar o
  // header do IP e ver se algum tráfego legítimo bateria no limite.
  if (rateLimitMode === 'observe') {
    if (!decision.ok) {
      console.warn(`[rate-limit] OBSERVE bloquearia ${method} ${path} ip=${ip} scope=${decision.scope} retryAfter=${decision.retryAfterSec}s`);
    }
    return NextResponse.next();
  }

  // ENFORCE
  if (decision.ok) return NextResponse.next();

  // Bloqueio logado para você acompanhar se está barrando gente legítima.
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
