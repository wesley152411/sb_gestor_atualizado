import { describe, it, expect, vi, beforeEach } from 'vitest';

// POR QUE ESTE TESTE EXISTE
//
// A prévia do link no WhatsApp vem das tags Open Graph. Sem metadata próprio, a
// página de orçamento HERDAVA o da raiz, e a cliente final recebia:
//
//     SB GESTOR — Gestão Inteligente para Decoradoras de Festas
//     Controle seu acervo, conecte-se com parceiras B2B e gerencie...
//
// Texto de venda do SB Gestor para decoradoras, num link que a decoradora manda
// para a cliente dela. Marca errada e público errado.
//
// Herança é silenciosa: apagar este layout não quebra nada, a prévia só volta a
// mostrar o texto errado. É o tipo de regressão que só aparece quando alguém
// manda um link e olha o cartãozinho — por isso a prova é automática.

const achado = vi.hoisted(() => ({ valor: null as null | { decorators: { name: string; company_name: string | null } } }));

vi.mock('@/lib/prisma', () => ({
  prisma: { partyEvent: { findUnique: vi.fn(async () => achado.valor) } },
}));

const { generateMetadata } = await import('@/app/orcamento/[token]/layout');

const gerar = (token = 'tok-1') => generateMetadata({ params: Promise.resolve({ token }) });

beforeEach(() => { achado.valor = null; });

describe('a prévia do link mostra a empresa da decoradora', () => {
  it('usa a razão social quando existe', async () => {
    achado.valor = { decorators: { name: 'Suzele', company_name: 'SB Festas Decorações' } };
    const meta = await gerar();
    expect(meta.title).toBe('SB Festas Decorações');
    expect(meta.openGraph?.title).toBe('SB Festas Decorações');
  });

  it('cai no nome do perfil quando não há razão social', async () => {
    achado.valor = { decorators: { name: 'SB Festas', company_name: null } };
    expect((await gerar()).title).toBe('SB Festas');
  });

  it('razão social só com espaços não vale como nome', async () => {
    achado.valor = { decorators: { name: 'SB Festas', company_name: '   ' } };
    expect((await gerar()).title).toBe('SB Festas');
  });

  it('NUNCA aparece a marca ou o texto de venda do SB Gestor', async () => {
    achado.valor = { decorators: { name: 'SB Festas', company_name: null } };
    const meta = await gerar();
    const tudo = JSON.stringify(meta);
    expect(tudo, 'o link é da decoradora, não do SB Gestor').not.toMatch(/Gestão Inteligente|acervo|parceiras B2B|plataforma cloud/i);
  });

  it('siteName é sobrescrito — herdado, o WhatsApp mostraria "SB Gestor"', async () => {
    achado.valor = { decorators: { name: 'SB Festas', company_name: null } };
    expect((await gerar()).openGraph?.siteName).toBe('SB Festas');
  });

  it('sem imagem: a herdada é o ícone do SB Gestor', async () => {
    achado.valor = { decorators: { name: 'SB Festas', company_name: null } };
    expect((await gerar()).openGraph?.images).toEqual([]);
  });
});

describe('o link não é para buscador', () => {
  it('marca noindex — é link privado por token, com dados de uma cliente', async () => {
    achado.valor = { decorators: { name: 'SB Festas', company_name: null } };
    const robots = (await gerar()).robots as { index?: boolean; follow?: boolean };
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(false);
  });
});

describe('degradação: nada derruba a página', () => {
  it('token inexistente usa um título neutro', async () => {
    achado.valor = null;
    const meta = await gerar('nao-existe');
    expect(meta.title).toBe('Orçamento');
    expect(JSON.stringify(meta)).not.toMatch(/Gestão Inteligente/i);
  });

  it('banco fora do ar não lança — a prévia perde o nome, o formulário abre', async () => {
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(prisma.partyEvent.findUnique).mockRejectedValueOnce(new Error('sem conexão'));
    await expect(gerar()).resolves.toMatchObject({ title: 'Orçamento' });
  });
});
