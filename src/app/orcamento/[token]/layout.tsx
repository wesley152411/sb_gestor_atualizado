import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';

// METADADOS DO LINK DE ORÇAMENTO.
//
// Quando a decoradora manda o link no WhatsApp, o aplicativo lê as tags Open
// Graph para montar a prévia. Sem esta camada, a prévia herdava o metadata da
// RAIZ e aparecia assim para a cliente final:
//
//     SB GESTOR — Gestão Inteligente para Decoradoras de Festas
//     Controle seu acervo, conecte-se com parceiras B2B e gerencie...
//
// que é o texto de venda do SB Gestor para decoradoras — público errado e marca
// errada. Quem manda o link é a decoradora, e quem recebe é a cliente dela: o
// que tem de aparecer é o nome da empresa DELA.
//
// generateMetadata só existe em Server Component, e a página é 'use client' —
// por isso este layout.

type Props = { params: Promise<{ token: string }> };

/** Nome a exibir: a razão social quando houver, senão o nome do perfil. */
async function nomeDaEmpresa(token: string): Promise<string | null> {
  try {
    const orcamento = await prisma.partyEvent.findUnique({
      where: { public_token: token },
      select: { decorators: { select: { name: true, company_name: true } } },
    });
    const dona = orcamento?.decorators;
    if (!dona) return null;
    return (dona.company_name || '').trim() || (dona.name || '').trim() || null;
  } catch {
    // Banco fora do ar não pode derrubar a página: a prévia perde o nome, o
    // formulário continua abrindo.
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const empresa = await nomeDaEmpresa(token);
  const titulo = empresa || 'Orçamento';
  const descricao = 'Orçamento do seu evento';

  return {
    title: titulo,
    description: descricao,
    // Link de orçamento é privado por token e carrega dados de uma cliente
    // específica. Não é página para buscador nenhum.
    robots: { index: false, follow: false },
    openGraph: {
      title: titulo,
      description: descricao,
      // siteName precisa ser sobrescrito: herdado, o WhatsApp mostraria
      // "SB Gestor" embaixo do nome da decoradora.
      siteName: titulo,
      type: 'website',
      locale: 'pt_BR',
      // Sem imagem de propósito. A herdada é o ícone do SB Gestor, e pôr a marca
      // de outra empresa no link da decoradora é o mesmo erro do título.
      images: [],
    },
  };
}

export default function OrcamentoTokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
