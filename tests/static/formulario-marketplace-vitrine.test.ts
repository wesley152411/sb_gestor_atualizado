import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';

// POR QUE ESTE TESTE EXISTE
//
// Três pedidos da dona, entregues juntos:
//  1. "Horário de chegada (montagem)" sai dos formulários e "Horário de início
//     da festa" vira "Horário de início da decoração" — no formulário interno,
//     no da cliente, no PDF e na pré-visualização.
//  4. O Marketplace some para todas as contas, menos as internas (a Mosaico),
//     atrás de flag. Esconder o menu não basta: a API é a barreira.
//  5. Vitrine pública compartilhável: só itens publicados E com valor, sem
//     carrinho, sem pedido, sem contato — e sem vazar custo nem estoque.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

describe('1. formulários: sem "chegada", com "início da decoração"', () => {
  const interno = ler('src/app/(dashboard)/party-form/page.tsx');
  const daCliente = ler('src/app/orcamento/[token]/page.tsx');
  const pdf = ler('src/lib/documento-pdf.ts');
  const previa = ler('src/app/(dashboard)/clients/page.tsx');

  it('formulário interno', () => {
    expect(interno).not.toMatch(/Horário de Chegada/);
    expect(interno).not.toMatch(/Horário de Início da Festa/);
    expect(interno).not.toMatch(/setSetupTime|setup_time: setupTime/);
    expect(interno).toMatch(/label="Horário de início da decoração"/);
  });

  it('formulário da cliente: o campo saiu; o resumo só mostra chegada de envio antigo', () => {
    // O CAMPO saiu. O texto "Horário de chegada" continua no resumo de leitura,
    // de propósito, só para envio antigo que tem o horário (asserção abaixo).
    expect(daCliente).not.toMatch(/<Input label="Horário de chegada"/);
    expect(daCliente).not.toMatch(/value=\{form\.setup_time\} onChange/);
    expect(daCliente).toMatch(/label="Horário de início da decoração"/);
    expect(daCliente).toMatch(/\{form\.setup_time && <ReadRow label="Horário de chegada"/);
  });

  it('PDF e pré-visualização dizem "início da decoração" — não "início da festa"', () => {
    for (const fonte of [pdf, previa]) {
      expect(fonte).not.toMatch(/início da festa/);
      expect(fonte).toMatch(/Início da decoração/);
    }
    // Evento antigo que tem chegada continua mostrando; o novo não ganha um "—".
    expect(pdf).toMatch(/if \(evento\.setup_time\) campos\.push\(\['Montagem', evento\.setup_time\]\)/);
  });
});

describe('4. Marketplace oculto (flag), menos para conta interna', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // A flag é lida quando o módulo carrega: recarrega a cada cenário.
  async function comFlag(valor: string) {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_OCULTAR_MARKETPLACE', valor);
    return import('@/lib/marketplace-acesso');
  }

  it('flag desligada: todo mundo usa, como sempre foi', async () => {
    const { marketplaceLiberado } = await comFlag('');
    expect(marketplaceLiberado(null)).toBe(true);
    expect(marketplaceLiberado({ is_internal: false })).toBe(true);
  });

  it('flag ligada: só conta interna', async () => {
    const { marketplaceLiberado } = await comFlag('true');
    expect(marketplaceLiberado({ is_internal: true })).toBe(true);
    expect(marketplaceLiberado({ is_internal: false })).toBe(false);
    expect(marketplaceLiberado({})).toBe(false);
    expect(marketplaceLiberado(null), 'sem o perfil carregado não libera').toBe(false);
  });

  it('a flag nasce DESLIGADA em todo ambiente — o harness usa o Marketplace em dev', () => {
    expect(ler('src/lib/feature-flags.ts'))
      .toMatch(/export const marketplaceOculto = process\.env\.NEXT_PUBLIC_FEATURE_OCULTAR_MARKETPLACE === 'true';/);
  });

  it('as rotas do Marketplace têm a barreira do servidor', () => {
    const guarda = /const barrado = await barrarMarketplace\((sessionId|acesso\.decoratorId|sessao\?\.id)\);\s*if \(barrado\) return barrado;/;
    for (const rota of ['inventory/route.ts', 'kits/route.ts']) {
      expect(ler(`src/app/api/${rota}`), `${rota}: o feed é o Marketplace`)
        .toMatch(/if \(!wantsOwn\) \{\s*const barrado = await barrarMarketplace\(sessionId\);\s*if \(barrado\) return barrado;/);
    }
    expect(ler('src/app/api/orders/route.ts'), 'criar locação')
      .toMatch(/if \(isCreate\) \{\s*const barrado = await barrarMarketplace\(sessionId\);\s*if \(barrado\) return barrado;/);
    expect(ler('src/app/api/orders/availability/route.ts'), 'disponibilidade').toMatch(guarda);
    expect(ler('src/app/api/public/decorator/[id]/route.ts'), 'página da parceira')
      .toMatch(/if \(marketplaceOculto\) \{\s*const sessao = await getSessionUser\(\);\s*const barrado = await barrarMarketplace\(sessao\?\.id\);/);
  });

  it('devolver e cancelar uma locação que já existe NÃO são barrados', () => {
    for (const rota of ['orders/[id]/return/route.ts', 'orders/[id]/cancel/route.ts']) {
      expect(ler(`src/app/api/${rota}`), `${rota}: ninguém fica preso numa locação em andamento`)
        .not.toMatch(/barrarMarketplace/);
    }
  });

  it('a barreira do servidor fica fora do alcance do proxy (Edge)', () => {
    expect(ler('src/lib/marketplace-servidor.ts')).toMatch(/^import 'server-only';/);
    // O que importa é o IMPORT: o comentário do arquivo cita a barreira do
    // servidor justamente para explicar por que ela não mora ali.
    const importsDasFlags = ler('src/lib/feature-flags.ts').split(/\r?\n/).filter((l) => /^\s*import\b/.test(l));
    expect(importsDasFlags.join('\n')).not.toMatch(/prisma|marketplace-servidor/);
  });

  it('menu, cabeçalho e telas respeitam o acesso', () => {
    const barra = ler('src/components/layout/Sidebar.tsx');
    expect(barra).toMatch(/item\.href !== '\/marketplace' \|\| marketplaceLiberado\(decorator\)/);
    expect(barra).toMatch(/\{secoesVisiveis\.map\(/);

    const cabecalho = ler('src/components/layout/Header.tsx');
    expect(cabecalho).toMatch(/\{marketplaceAberto && \(\s*<div className="relative" ref=\{cartRef\}>/);
    expect(cabecalho).toMatch(/href: marketplaceAberto \? '\/marketplace' : '\/calendar'/);

    expect(ler('src/app/(dashboard)/marketplace/page.tsx')).toMatch(/<PortaoMarketplace>\s*<MarketplaceConteudo \/>/);
    expect(ler('src/app/(dashboard)/marketplace/partner/[id]/page.tsx')).toMatch(/<PortaoMarketplace>\s*<PaginaDaParceira \/>/);
    expect(ler('src/app/(dashboard)/marketplace/my-page/page.tsx'), 'a Minha Página continua para todas')
      .not.toMatch(/PortaoMarketplace/);
  });

  it('Minha Página e landing não prometem um Marketplace que ficou oculto', () => {
    // Publicar continua valendo (alimenta a vitrine); o que não pode é o texto
    // dizer "no Marketplace" nem "visível para outras decoradoras alugarem".
    const minha = ler('src/app/(dashboard)/marketplace/my-page/page.tsx');
    const semComentarios = minha.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(semComentarios).not.toMatch(/Marketplace|decoradoras alugarem|Visível B2B/);
    expect(minha).toMatch(/>Meus Itens Publicados</);
    expect(minha).toMatch(/<span>Publicado<\/span>/);
    expect(ler('src/components/landing/sections.tsx'), 'botão "Explorar Marketplace" saiu')
      .not.toMatch(/href="\/marketplace"/);
  });

  it('o portão espera o perfil chegar antes de mandar a conta embora', () => {
    expect(ler('src/components/marketplace/PortaoMarketplace.tsx')).toMatch(/const recusado = !!decorator && !liberado;/);
  });
});

describe('5. vitrine pública', () => {
  const rota = ler('src/app/api/public/vitrine/[id]/route.ts');
  const grade = ler('src/app/vitrine/[id]/page.tsx');
  const detalhe = ler('src/app/vitrine/[id]/[tipo]/[itemId]/page.tsx');

  it('só itens publicados E com valor — "A definir" fica de fora', () => {
    expect(rota).toMatch(/status: 'Público', rental_price: \{ gt: 0 \}/);
    expect(rota).toMatch(/status: 'Público', value: \{ gt: 0 \}/);
  });

  it('não expõe custo interno, estoque nem contato', () => {
    expect(rota).not.toMatch(/internal_cost|stock_quantity|whatsapp|instagram|phone/);
  });

  it('conta interna não tem vitrine; com a flag desligada a rota é 404', () => {
    expect(rota).toMatch(/where: \{ id, is_internal: false \}/);
    expect(rota).toMatch(/if \(!vitrinePublica\) \{\s*return NextResponse\.json\(\{ error: 'Não encontrado' \}, \{ status: 404 \}\);/);
  });

  it('erro de banco vai para o log, não para a resposta pública', () => {
    expect(rota).not.toMatch(/\.message/);
  });

  it('as telas não têm carrinho, pedido nem contato — é só olhar e compartilhar', () => {
    for (const tela of [grade, detalhe]) {
      expect(tela).not.toMatch(/useCartStore|createRentalOrder|whatsapp|wa\.me/i);
    }
  });

  it('item sem foto ganha o espaço cinza, não some', () => {
    expect(grade).toMatch(/item\.imagem \? \([\s\S]*?\) : \(\s*<Package className="vitrine-foto-vazia"/);
  });

  it('o topo é a marca da decoradora: capa da Minha Página e logo dela', () => {
    // A capa é a MESMA foto que ela escolheu na Minha Página (cover_url), e a
    // logo é o avatar da conta. Nada de imagem do SB Gestor na página dela.
    expect(rota).toMatch(/cover_url: true/);
    expect(rota).toMatch(/capa: dona\.cover_url \|\| ''/);
    expect(grade).toMatch(/style=\{vitrine\.capa \? \{ backgroundImage: `url\(\$\{vitrine\.capa\}\)` \} : undefined\}/);
    expect(grade).toMatch(/<img src=\{vitrine\.avatar\}/);
  });

  it('o rótulo do item é o DADO (Kit ou Peça), não uma categoria inventada', () => {
    for (const tela of [grade, detalhe]) {
      expect(tela).toMatch(/item\.tipo === 'kit' \? 'Kit' : 'Peça'/);
    }
    // Textos do print de referência que seriam invenção: categoria que o acervo
    // não tem, e um "a partir de" que o preço não é.
    for (const tela of [grade, detalhe]) {
      expect(tela, 'categoria inventada').not.toMatch(/TEMA INFANTIL|Tema infantil/i);
      expect(tela, 'o valor é o da locação, não um mínimo').not.toMatch(/A PARTIR DE|A partir de/i);
    }
  });

  it('o preço aparece sobre a foto e o kit lista o que vem dentro', () => {
    expect(grade).toMatch(/<span className="vitrine-preco">\{formatCurrency\(item\.preco\)\}<\/span>/);
    expect(detalhe).toMatch(/item\.tipo === 'kit' && item\.pecas\.length > 0/);
  });

  it('botão de compartilhar: só o ícone, com nome acessível, atrás da flag', () => {
    const botao = ler('src/components/vitrine/CompartilharVitrine.tsx');
    expect(botao).toMatch(/aria-label="Compartilhar minha página"/);
    expect(botao).toMatch(/<Share2 /);
    expect(botao, 'nenhum texto visível no botão').not.toMatch(/>\s*Compartilhar[^<]*</);
    expect(ler('src/app/(dashboard)/marketplace/my-page/page.tsx'))
      .toMatch(/\{vitrinePublica && decorator && \(\s*<CompartilharVitrine/);
  });

  it('o compartilhar não fica colado no Editar Perfil', () => {
    // Sem o gap explícito os dois botões encostam: a classe utilitária gap-2
    // não existe no CSS próprio do projeto.
    expect(ler('src/app/(dashboard)/marketplace/my-page/page.tsx'))
      .toMatch(/marginTop: '8px', display: 'flex', gap: '10px'/);
  });
  it('a prévia do link leva o nome da decoradora, não o do SB Gestor', () => {
    const layout = ler('src/app/vitrine/[id]/layout.tsx');
    expect(layout).toMatch(/siteName: titulo/);
    expect(layout).toMatch(/images: \[\]/);
  });
});
