import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireDecorator } from '@/lib/api-auth';
import { ASSUNTOS_SUPORTE, LIMITE_MENSAGEM, TIPOS_FEEDBACK, type TipoFeedback } from '@/lib/suporte';

// CAMADA 1 (autenticada), e não leitura/operação, DE PROPÓSITO: quem está
// suspensa por falta de pagamento é justamente quem mais precisa falar com o
// suporte. Trancar o canal de recado atrás da assinatura faria o problema de
// cobrança virar um beco sem saída — a mesma razão de billing/cancelamento.

export async function GET() {
  try {
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;

    // Só a nota vigente: é o que a tela precisa para já abrir com a carinha
    // dela marcada. O histórico inteiro não é assunto da decoradora — é nosso,
    // e se lê por scripts/ver-feedback.cjs.
    const ultima = await prisma.supportFeedback.findFirst({
      where: { decorator_id: acesso.decoratorId, tipo: 'avaliacao' },
      orderBy: { criado_em: 'desc' },
      select: { nota: true, criado_em: true },
    });

    return NextResponse.json({ nota: ultima?.nota ?? null, avaliada_em: ultima?.criado_em ?? null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;

    const corpo = await request.json().catch(() => null);
    if (!corpo || typeof corpo !== 'object') {
      return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
    }

    const tipo = corpo.tipo as TipoFeedback;
    if (!TIPOS_FEEDBACK.includes(tipo)) {
      return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
    }

    // Nota: opcional, mas quando vem tem de ser uma das cinco carinhas. Deixar
    // passar um 7 aqui só adiaria o erro para o CHECK do banco, que chega cru.
    let nota: number | null = null;
    if (corpo.nota !== undefined && corpo.nota !== null) {
      nota = Number(corpo.nota);
      if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
        return NextResponse.json({ error: 'nota deve ser um inteiro de 1 a 5' }, { status: 400 });
      }
    }
    if (tipo === 'avaliacao' && nota === null) {
      return NextResponse.json({ error: 'avaliação exige nota' }, { status: 400 });
    }

    // Assuntos: partindo da lista FECHADA, e não do que veio no corpo. Isso
    // filtra o desconhecido, tira repetido e fixa a ordem de uma vez — sem isso a
    // coluna vira campo de texto livre por outra porta.
    const brutos: unknown[] = Array.isArray(corpo.assuntos) ? corpo.assuntos : [];
    const assuntos: string[] = ASSUNTOS_SUPORTE.filter((a) => brutos.includes(a));

    const mensagem = typeof corpo.mensagem === 'string' ? corpo.mensagem.trim() : '';
    if (mensagem.length > LIMITE_MENSAGEM) {
      return NextResponse.json({ error: `mensagem acima de ${LIMITE_MENSAGEM} caracteres` }, { status: 400 });
    }
    // Uma opinião sem texto é um clique perdido: não vale gravar linha.
    if (tipo === 'opiniao' && !mensagem) {
      return NextResponse.json({ error: 'escreva sua opinião antes de enviar' }, { status: 400 });
    }

    const row = await prisma.supportFeedback.create({
      // Dono SEMPRE pela sessão, nunca por parâmetro do corpo.
      data: { decorator_id: acesso.decoratorId, tipo, nota, assuntos, mensagem: mensagem || null },
      select: { id: true, tipo: true, nota: true, criado_em: true },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
