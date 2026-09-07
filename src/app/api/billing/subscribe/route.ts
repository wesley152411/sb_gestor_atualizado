import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { criarAssinatura } from '@/lib/assinatura';

// Cria a preapproval no Mercado Pago e devolve o init_point para o redirect.
//
// NÃO exige assinatura (é como se assina), mas exige sessão, e-mail confirmado e
// aceite legal — por isso requireDecorator, não requireAssinaturaAtiva.

export async function POST(request: Request) {
  const acesso = await requireDecorator();
  if (!acesso.ok) return acesso.response;

  // O e-mail do pagador vem da SESSÃO, nunca do corpo: senão dá para abrir
  // assinatura em nome de outra pessoa.
  const supabase = await createSupabaseServerClient();
  const email = supabase ? (await supabase.auth.getUser()).data.user?.email : null;
  if (!email) {
    return NextResponse.json({ error: 'Não foi possível identificar seu e-mail.' }, { status: 400 });
  }

  // O Mercado Pago RECUSA back_url que não seja HTTPS público — "Invalid value for
  // back_url, must be a valid URL". Em localhost isso nunca passa, então o
  // desenvolvimento precisa de MP_BACK_URL_BASE apontando para um túnel (o mesmo
  // que o webhook vai exigir). Em produção a origem da requisição já serve.
  const origem = process.env.MP_BACK_URL_BASE || new URL(request.url).origin;
  if (!origem.startsWith('https://')) {
    console.error(
      `[assinatura] back_url inválida (${origem}): o Mercado Pago exige HTTPS público. ` +
      'Defina MP_BACK_URL_BASE com a URL do túnel.',
    );
    return NextResponse.json({ error: 'Assinatura indisponível nesta configuração.' }, { status: 503 });
  }

  const resultado = await criarAssinatura(acesso.decoratorId, email, origem.replace(/\/$/, ''));

  if (!resultado.ok) {
    if (resultado.motivo === 'ja_tem_assinatura') {
      return NextResponse.json({ error: 'Você já tem uma assinatura ativa.', code: 'JA_ASSINANTE' }, { status: 409 });
    }
    console.error(`[assinatura] falha ao criar para ${acesso.decoratorId}: ${resultado.detalhe}`);
    return NextResponse.json({ error: 'Não foi possível iniciar a assinatura agora. Tente novamente.' }, { status: 502 });
  }

  return NextResponse.json({
    initPoint: resultado.initPoint,
    comTeste: resultado.comTeste,
    reativacao: resultado.reativacao,
  });
}
