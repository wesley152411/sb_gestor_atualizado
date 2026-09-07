import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { aplicarEstadoDaAssinatura } from '@/lib/assinatura';
import { concedeAcesso, type StatusLocal } from '@/lib/assinatura-estado';

// O retorno do navegador chama isto. Ele NÃO confia no redirect: o preapproval_id
// da URL é só um ponteiro; quem diz o que aconteceu é a API do Mercado Pago,
// relida no servidor. É a mesma função que o webhook usa.

export async function POST(request: Request) {
  const acesso = await requireDecorator();
  if (!acesso.ok) return acesso.response;

  const corpo = await request.json().catch(() => ({}));
  const preapprovalId = typeof corpo.preapproval_id === 'string' ? corpo.preapproval_id : '';
  if (!preapprovalId) {
    return NextResponse.json({ error: 'preapproval_id ausente.' }, { status: 400 });
  }

  // A preapproval tem de ser DESTA decoradora. Sem esta checagem, qualquer sessão
  // válida poderia sincronizar (e ler o estado da) assinatura alheia só sabendo o id.
  const linha = await prisma.subscription.findUnique({
    where: { mp_preapproval_id: preapprovalId },
    select: { decorator_id: true },
  });
  if (!linha || linha.decorator_id !== acesso.decoratorId) {
    return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });
  }

  const resultado = await aplicarEstadoDaAssinatura(preapprovalId);
  if (!resultado.ok) {
    console.error(`[assinatura] sync falhou (${resultado.motivo}): ${resultado.detalhe}`);
    // 'nao_existe_no_mp' e 'erro_mp' são transitórios do ponto de vista da tela:
    // ela continua tentando e o job de reconciliação termina o serviço.
    return NextResponse.json({ pronto: false, motivo: resultado.motivo }, { status: 202 });
  }

  const atual = await prisma.subscription.findUnique({ where: { mp_preapproval_id: preapprovalId } });
  const liberado = atual
    ? concedeAcesso({ status: atual.status as StatusLocal, periodo_fim: atual.periodo_fim }, new Date())
    : false;

  return NextResponse.json({
    pronto: liberado,
    status: resultado.status,
    periodo_fim: atual?.periodo_fim ?? null,
  });
}
