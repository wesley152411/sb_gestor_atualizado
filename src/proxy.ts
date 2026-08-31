// Proxy do Next 16 (o antigo "middleware" — renomeado nesta versão; ver
// node_modules/next/dist/docs/.../proxy.md). Fase 1 do rate limiting: SÓ as rotas
// públicas (/api/public/*), que são as mais expostas por não exigirem login.
//
// Flag NEXT_PUBLIC_RATE_LIMIT_ENABLED (on/off) + RATE_LIMIT_MODE (observe|enforce):
//   desligado         — não faz nada (mas ainda marca o header de diagnóstico).
//   ligado + observe  — loga IP + latência do Redis + o que FARIA, sem bloquear.
//   ligado (enforce)  — bloqueia (429 + Retry-After).
//
// DIAGNÓSTICO: toda requisição que casa o matcher recebe o header `x-ratelimit` na
// resposta (disabled | observe | enforce-pass | enforce-block). Só isso — os headers
// verbosos (ip/ipsrc/redis-ms) saíram; a informação de IP/latência vai para os logs
// (Functions), e o bloqueio é logado com IP/rota/limite.
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { rateLimitEnabled, rateLimitObserveOnly } from '@/lib/feature-flags';
import { resolveClientIp, checkPublicRateLimit } from '@/lib/rate-limit';
import { currentLegalAccess } from '@/lib/legal';

export const config = {
  matcher: ['/api/:path*'],
};

const LEGAL_EXEMPT_PATHS = ['/api/legal/', '/api/decorators/me', '/api/public/'];

// Gate de aceite dos documentos legais. Roda ANTES de tudo em /api/*: sem aceite
// da versao ATUAL, 403 — a checagem da interface e conveniencia, esta e a barreira.
// Isentas: as proprias rotas legais e /api/decorators/me (a tela precisa delas para
// conseguir aceitar) e /api/public/* (cliente final, sem login).
//
// FALHA ABERTA de proposito: se os .md nao chegarem ao deploy, a rota de aceite cai
// junto — fechar aqui trancaria todo mundo para fora SEM caminho de saida. Fica o
// log gritado para aparecer nos logs de Functions.
async function legalGate(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (LEGAL_EXEMPT_PATHS.some((prefix) => path.startsWith(prefix))) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } });
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user || !(user.email_confirmed_at || user.confirmed_at)) return null;
  try {
    const legal = await currentLegalAccess(user.id);
    if (legal.accepted) return null;
  } catch (reason) {
    console.error(`[legal-gate] FALHA ABERTA em ${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
    return null;
  }
  return NextResponse.json({ error: 'Aceite dos documentos legais necessário.', code: 'LEGAL_ACCEPTANCE_REQUIRED' }, { status: 403 });
}

// Passa adiante marcando só o header de diagnóstico x-ratelimit.
function pass(mark: string) {
  const res = NextResponse.next();
  res.headers.set('x-ratelimit', mark);
  return res;
}

export async function proxy(request: NextRequest) {
  const blockedByLegal = await legalGate(request);
  if (blockedByLegal) return blockedByLegal;

  if (!request.nextUrl.pathname.startsWith('/api/public/')) return pass('not-public');
  if (!rateLimitEnabled) return pass('disabled');

  const path = request.nextUrl.pathname;
  const method = request.method;
  const { ip, candidates } = resolveClientIp(request.headers);
  const ipSource =
    candidates['x-nf-client-connection-ip'] ? 'x-nf-client-connection-ip'
    : candidates['x-forwarded-for'] ? 'x-forwarded-for'
    : candidates['x-real-ip'] ? 'x-real-ip'
    : 'none';

  const t0 = Date.now();
  const decision = await checkPublicRateLimit({ path, method, key: ip });
  const redisMs = Date.now() - t0;

  // OBSERVE: nunca bloqueia — só registra (IP, latência, o que faria). Serve para
  // validar o header do IP e ver se algum tráfego legítimo bateria no limite.
  if (rateLimitObserveOnly) {
    console.log(`[rate-limit] OBSERVE ${method} ${path} ip=${ip} ipsrc=${ipSource} redisMs=${redisMs} wouldBlock=${!decision.ok}${decision.ok ? '' : ` scope=${decision.scope}`}`);
    return pass('observe');
  }

  // ENFORCE
  if (decision.ok) return pass('enforce-pass');

  // Bloqueio logado (IP/rota/limite) para você acompanhar se barra gente legítima.
  console.warn(`[rate-limit] BLOCK ${method} ${path} ip=${ip} ipsrc=${ipSource} scope=${decision.scope} limit=${decision.limit} retryAfter=${decision.retryAfterSec}s`);
  return new NextResponse(
    JSON.stringify({ error: 'Muitas requisições. Tente novamente em instantes.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(decision.retryAfterSec),
        'x-ratelimit': 'enforce-block',
      },
    }
  );
}
