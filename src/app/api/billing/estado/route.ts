import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { assinaturaVigente, jaUsouTesteGratis } from '@/lib/assinatura';
import { concedeAcesso, VALOR_MENSAL_CENTAVOS, type StatusLocal } from '@/lib/assinatura-estado';

// Estado da assinatura para a tela. Só devolve o que a tela precisa mostrar —
// nada de id de preapproval, valor confirmado no MP ou contadores internos.

export async function GET() {
  const acesso = await requireDecorator();
  if (!acesso.ok) return acesso.response;

  const [assinatura, decoradora] = await Promise.all([
    assinaturaVigente(acesso.decoratorId),
    prisma.decorator.findUnique({ where: { id: acesso.decoratorId }, select: { cnpj: true } }),
  ]);

  const agora = new Date();
  const liberado = assinatura
    ? concedeAcesso({ status: assinatura.status as StatusLocal, periodo_fim: assinatura.periodo_fim }, agora)
    : false;

  // Só oferece teste a quem ainda não assinou nada. Quem está reativando não tem
  // direito a novo período gratuito (Termos 6.3).
  const podeTeste = !assinatura && !(await jaUsouTesteGratis(decoradora?.cnpj ?? null));

  return NextResponse.json({
    status: assinatura?.status ?? 'sem_assinatura',
    liberado,
    periodo_fim: assinatura?.periodo_fim ?? null,
    proxima_cobranca: assinatura?.proxima_cobranca ?? null,
    teste_fim: assinatura?.teste_fim ?? null,
    plano: assinatura?.plano ?? null,
    valor_centavos: assinatura?.valor_centavos ?? VALOR_MENSAL_CENTAVOS,
    ofereceTeste: podeTeste,
    reativacao: Boolean(assinatura?.status === 'cancelada' && liberado),
  });
}
