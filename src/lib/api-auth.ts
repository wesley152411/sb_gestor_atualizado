import 'server-only';

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { currentLegalAccess } from '@/lib/legal';
import { prisma } from '@/lib/prisma';
import { concedeAcesso, podeLerProprios, type StatusLocal } from '@/lib/assinatura-estado';

// PORTA ÚNICA das rotas privadas. Devolve o decorator_id da sessão OU a resposta
// de recusa já pronta — não existe caminho que entregue o id sem passar pelo
// aceite dos documentos legais.
//
// Por que aqui e não no proxy: o adapter da Netlify compila o proxy como Edge
// Function (Deno), onde binário nativo não roda — Prisma quebra o EMPACOTAMENTO
// do build, não a compilação. O `next build` local passa e a Netlify falha. A
// barreira vive onde a identidade já é verificada e o Prisma já roda: no handler.
//
// `getSessionDecoratorId` foi REMOVIDO de propósito. Enquanto existisse, uma rota
// nova poderia autenticar sem gate só por esquecimento; agora a porta sem gate
// não existe. `tests/static/api-gate.test.ts` guarda essa propriedade.
export type DecoratorAccess =
  | { ok: true; decoratorId: string }
  | { ok: false; response: NextResponse };

export async function requireDecorator(): Promise<DecoratorAccess> {
  const user = await getSessionUser();
  // SEM sessão OU e-mail NÃO confirmado => 401, igual a uma requisição sem sessão.
  if (!user || !user.emailConfirmed) {
    return { ok: false, response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  }

  try {
    const legal = await currentLegalAccess(user.id);
    if (!legal.accepted) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Aceite dos documentos legais necessário.', code: 'LEGAL_ACCEPTANCE_REQUIRED' },
          { status: 403 },
        ),
      };
    }
  } catch (reason) {
    // FALHA ABERTA de propósito: se os .md não chegarem ao deploy, a rota de
    // aceite cai junto — fechar aqui trancaria todo mundo para fora SEM caminho
    // de saída. Fica o log gritado para aparecer nos logs de Functions.
    console.error(`[legal-gate] FALHA ABERTA: ${reason instanceof Error ? reason.message : String(reason)}`);
  }

  return { ok: true, decoratorId: user.id };
}

// ---------------------------------------------------------------------------
// CAMADAS DE ACESSO
//
//   0  pública        — nada. Rotas /api/public/*, documentos legais, webhook
//                       (que se autentica por HMAC, não por sessão).
//   1  autenticada    — requireDecorator: sessão + e-mail + aceite legal.
//                       Perfil próprio e /api/billing/* vivem aqui: é preciso
//                       poder entrar para conseguir assinar.
//   2  leitura        — requireLeitura: + já ter assinado alguma vez.
//   3  operação       — requireAssinaturaAtiva: + assinatura vigente.
//
// A separação entre 2 e 3 é o que torna real a guarda de 90 dias dos Termos 6.3:
// quem está suspensa CONSEGUE ver e conferir os próprios dados, e não consegue
// criar, alterar nem apagar. Trancá-la fora de tudo faria o prazo não significar
// nada na prática.
//
// As rotas PÚBLICAS não consultam assinatura, de propósito: um link de orçamento
// já enviado é compromisso assumido com a cliente final, e quebrá-lo puniria
// quem não deve nada. Criar link NOVO, sim, exige assinatura (camada 3).
// ---------------------------------------------------------------------------

async function assinaturaCorrente(decoratorId: string) {
  return prisma.subscription.findFirst({
    where: { decorator_id: decoratorId, vigente: true },
    select: { status: true, periodo_fim: true },
  });
}

function recusa(code: 'SUBSCRIPTION_REQUIRED' | 'SUBSCRIPTION_READ_ONLY', error: string) {
  // 402 Payment Required distingue de 401 (sem sessão) e 403 (sem aceite legal):
  // a interface precisa mandar cada caso para uma tela diferente.
  //
  // Os DOIS códigos separam falhas diferentes na hora de diagnosticar:
  //   SUBSCRIPTION_REQUIRED  -> NÃO achou linha vigente (nunca assinou, ou a
  //                             semeadura de cortesia não pegou)
  //   SUBSCRIPTION_READ_ONLY -> achou a linha, mas o período acabou (guarda de
  //                             90 dias; é estado esperado, não falha)
  // Runbook: docs/features/assinatura-mercadopago.md §5.4.
  return { ok: false as const, response: NextResponse.json({ error, code }, { status: 402 }) };
}

/** CAMADA 2 — ler os próprios dados. Vale para suspensa e expirada. */
export async function requireLeitura(): Promise<DecoratorAccess> {
  const base = await requireDecorator();
  if (!base.ok) return base;

  const assinatura = await assinaturaCorrente(base.decoratorId);
  if (!podeLerProprios(assinatura ? { status: assinatura.status as StatusLocal } : null)) {
    return recusa('SUBSCRIPTION_REQUIRED', 'Assine para usar o SB Gestor.');
  }
  return base;
}

/** CAMADA 3 — criar, alterar, apagar. Exige assinatura vigente. */
export async function requireAssinaturaAtiva(): Promise<DecoratorAccess> {
  const base = await requireDecorator();
  if (!base.ok) return base;

  const assinatura = await assinaturaCorrente(base.decoratorId);
  const estado = assinatura ? { status: assinatura.status as StatusLocal, periodo_fim: assinatura.periodo_fim } : null;

  if (estado && concedeAcesso(estado, new Date())) return base;

  // Já assinou e ainda pode LER: a mensagem é outra, e a tela também. Dizer
  // "assine" a quem está dentro dos 90 dias de guarda seria enganoso.
  if (podeLerProprios(estado)) {
    return recusa(
      'SUBSCRIPTION_READ_ONLY',
      'Sua assinatura não está ativa. Você pode consultar seus dados, mas não fazer alterações.',
    );
  }
  return recusa('SUBSCRIPTION_REQUIRED', 'Assine para usar o SB Gestor.');
}
