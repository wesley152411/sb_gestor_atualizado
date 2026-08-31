import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';

// Lista de decoradoras (usada por Marketplace, Chat e resolução de dono).
// PÚBLICO MÍNIMO: nome, foto/logo e cidade. NUNCA telefone/whatsapp/instagram/
// about — esses são dados de contato e não devem sair numa listagem geral.
// O perfil COMPLETO do próprio dono vem de /api/decorators/me (por sessão).
export async function GET() {
  try {
    const decorators = await prisma.decorator.findMany({
      // Contas internas de teste NÃO aparecem na vitrine/contatos. É o ÚNICO
      // lugar que olha para essa flag — ela nunca vira exceção de isolamento.
      where: { is_internal: false },
      select: {
        id: true,
        name: true,
        avatar_url: true,
        logo_url: true,
        location: true,
        membership_level: true,
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(decorators);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Só dá pra criar/editar o PRÓPRIO perfil (id da sessão). Antes: sem authz.
    const acesso = await requireDecorator();
    if (!acesso.ok) return acesso.response;
    const decoratorId = acesso.decoratorId;

    const body = await request.json();
    const { id, ...data } = body;
    // is_internal NUNCA é setável por API — só por UPDATE direto no banco.
    delete (data as Record<string, unknown>).is_internal;
    if (id && id !== decoratorId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const updated = await prisma.decorator.upsert({
      where: { id: decoratorId },
      update: data,
      create: { id: decoratorId, ...data },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
