import 'server-only';

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { currentLegalAccess } from '@/lib/legal';

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
