import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { vitrinePublica } from '@/lib/feature-flags';

// METADADOS DA VITRINE. Quem manda o link é a decoradora e quem recebe é a
// cliente dela: a prévia no WhatsApp/Instagram tem de mostrar o nome da empresa
// DELA, nunca o texto de venda do SB Gestor herdado da raiz — o mesmo erro que
// já foi corrigido no link de orçamento (src/app/orcamento/[token]/layout.tsx).
//
// generateMetadata só existe em Server Component, e as páginas são 'use client'
// — por isso este layout.

type Props = { params: Promise<{ id: string }> };

async function nomeDaDecoradora(id: string): Promise<string | null> {
  // Flag desligada: a vitrine não existe, e a prévia não confirma nome nenhum.
  if (!vitrinePublica) return null;
  try {
    const dona = await prisma.decorator.findFirst({
      where: { id, is_internal: false },
      select: { name: true },
    });
    if (!dona) return null;
    // O nome da CONTA, o mesmo que a vitrine mostra. O company_name do cadastro
    // fica congelado e já fez o link chegar com outro nome.
    return (dona.name || '').trim() || null;
  } catch {
    // Banco fora do ar não pode derrubar a página: a prévia perde o nome, a
    // vitrine continua abrindo.
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const nome = await nomeDaDecoradora(id);
  const titulo = nome || 'Vitrine';
  const descricao = nome ? `Peças e kits de ${nome}` : 'Peças e kits';

  return {
    title: titulo,
    description: descricao,
    // Fora dos buscadores por enquanto: a vitrine é para ser compartilhada, não
    // encontrada. Abrir para indexação é uma decisão à parte.
    robots: { index: false, follow: false },
    openGraph: {
      title: titulo,
      description: descricao,
      siteName: titulo,
      type: 'website',
      locale: 'pt_BR',
      // Sem imagem herdada: a da raiz é o ícone do SB Gestor.
      images: [],
    },
  };
}

export default function VitrineDecoradoraLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
