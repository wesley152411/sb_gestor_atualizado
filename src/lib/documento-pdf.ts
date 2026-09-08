import type { PartyEvent, Client, Decorator } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { formatarEndereco } from '@/lib/endereco';

// ============================================================================
// O ÚNICO GERADOR DE PDF DO SISTEMA.
//
// Antes existiam dois — quote-pdf (terracota, com logo da decoradora) e
// pdf-generator (roxo, "Logística B2B") — chamados de QUATRO lugares. O mesmo
// evento saía com aparências diferentes conforme o botão apertado, e ninguém
// conseguia dizer qual era "o documento".
//
// Aqui é um layout só, com DUAS VARIANTES:
//
//   'contrato' — para a decoradora e a cliente. Tem valores, dados do cliente
//                e o total. É o documento do acerto.
//   'equipe'   — para quem carrega o caminhão. MESMO layout e MESMA marca, mas
//                sem nenhum valor em dinheiro, e com o checklist em destaque.
//
// A variante existe por uma razão de negócio, não estética: não faz sentido
// entregar a tabela de preços da decoradora para o ajudante da montagem.
// ============================================================================

export type VarianteDocumento = 'contrato' | 'equipe';

// Marca do SB Gestor — os mesmos valores do componente Logo (losango
// azul-petróleo, anel branco, centro magenta). Desenhados como vetor, não como
// imagem: sai nítido em qualquer zoom e não depende de fetch nem de base64.
const PETROLEO: [number, number, number] = [0, 136, 176];   // #0088B0
const MAGENTA: [number, number, number] = [214, 0, 108];    // #D6006C
const TINTA: [number, number, number] = [23, 32, 42];       // texto principal
const TINTA_FRACA: [number, number, number] = [110, 122, 133];
const BLOCO: [number, number, number] = [244, 247, 249];    // fundo dos blocos
const LINHA_PAR: [number, number, number] = [250, 251, 252];
const CABECA_TABELA: [number, number, number] = [30, 41, 59];
const BORDA: [number, number, number] = [222, 229, 235];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Superfície MÍNIMA do jsPDF que este documento usa. Existe para que o desenho
// possa ser exercitado com um dublê que registra o que seria escrito — é assim
// que se prova que a variante 'equipe' não imprime dinheiro, sem depender de ler
// o binário do PDF. O jsPDF satisfaz esta interface estruturalmente.
export interface PDFMinimo {
  setFillColor(r: number, g: number, b: number): unknown;
  setTextColor(r: number, g: number, b: number): unknown;
  setDrawColor(r: number, g: number, b: number): unknown;
  setLineWidth(w: number): unknown;
  setFont(nome: string, estilo?: string): unknown;
  setFontSize(tamanho: number): unknown;
  rect(x: number, y: number, w: number, h: number, estilo?: string): unknown;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, estilo?: string): unknown;
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, estilo?: string): unknown;
  line(x1: number, y1: number, x2: number, y2: number): unknown;
  text(texto: string | string[], x: number, y: number, opcoes?: { align?: string }): unknown;
  splitTextToSize(texto: string, largura: number): string[];
  addPage(): unknown;
  getNumberOfPages(): number;
}

type Doc = PDFMinimo;

/**
 * De onde ler o endereço: do EVENTO quando ele tem algum, senão do cliente.
 * A escolha entre novo e antigo é do módulo de endereço, não daqui.
 */
function estruturadoOuAntigo(evento: PartyEvent, cliente: Client | null) {
  const temNoEvento = Boolean(evento.address || evento.cep);
  return temNoEvento ? evento : (cliente ?? evento);
}

/** Losango da marca, em vetor. cx/cy é o centro; `l` é a meia-diagonal. */
function desenharLogo(doc: Doc, cx: number, cy: number, l: number) {
  const losango = (raio: number, cor: [number, number, number]) => {
    doc.setFillColor(...cor);
    doc.triangle(cx, cy - raio, cx + raio, cy, cx, cy + raio, 'F');
    doc.triangle(cx, cy - raio, cx - raio, cy, cx, cy + raio, 'F');
  };
  losango(l, PETROLEO);
  losango(l * 0.47, [255, 255, 255]);
  losango(l * 0.25, MAGENTA);
}

/**
 * Desenha o documento inteiro. Separado do save de propósito: o desenho é o que
 * tem regra de negócio (o que cada variante mostra), e é o que precisa de prova.
 */
export function desenharDocumento(
  doc: Doc,
  evento: PartyEvent,
  cliente: Client | null,
  decoradora: Decorator | null,
  variante: VarianteDocumento,
): void {
  const equipe = variante === 'equipe';

  let y = 0;

  const espaco = (precisa: number) => {
    if (y + precisa > PAGE_H - 22) {
      rodape(doc);
      doc.addPage();
      y = MARGIN;
    }
  };

  // ---------- FAIXA + CABEÇALHO ----------
  // Faixa azul-petróleo com um trecho magenta: é a assinatura visual da marca,
  // e é o que faz os dois documentos serem reconhecidos como o mesmo produto.
  doc.setFillColor(...PETROLEO);
  doc.rect(0, 0, PAGE_W, 4, 'F');
  doc.setFillColor(...MAGENTA);
  doc.rect(0, 0, 58, 4, 'F');

  y = 16;
  desenharLogo(doc, MARGIN + 8, y + 7, 8);

  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SB GESTOR', MARGIN + 20, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TINTA_FRACA);
  doc.text(decoradora?.name || '', MARGIN + 20, y + 10.5);

  // Título à DIREITA — é o que diz de cara qual documento está na mão.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...PETROLEO);
  doc.text(equipe ? 'Checklist de montagem' : 'Orçamento do evento', PAGE_W - MARGIN, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TINTA_FRACA);
  doc.text(
    equipe ? 'Documento interno — equipe de montagem' : `Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
    PAGE_W - MARGIN, y + 9.5, { align: 'right' },
  );

  y += 18;
  doc.setDrawColor(...BORDA);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // ---------- SEÇÃO NUMERADA ----------
  let numeroSecao = 0;
  const secao = (titulo: string) => {
    numeroSecao += 1;
    espaco(16);
    doc.setFillColor(...PETROLEO);
    doc.rect(MARGIN, y - 3.6, 2.4, 5.2, 'F');
    doc.setTextColor(...TINTA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(`${numeroSecao}. ${titulo.toUpperCase()}`, MARGIN + 6, y);
    y += 8;
  };

  /** Bloco cinza com pares rótulo/valor em duas colunas. */
  const bloco = (campos: [string, string][]) => {
    const linhas = Math.ceil(campos.length / 2);
    const altura = linhas * 9 + 6;
    espaco(altura + 4);
    doc.setFillColor(...BLOCO);
    doc.roundedRect(MARGIN, y - 4, CONTENT_W, altura, 2, 2, 'F');

    campos.forEach(([rotulo, valor], i) => {
      const col = i % 2;
      const linha = Math.floor(i / 2);
      const x = MARGIN + 5 + col * (CONTENT_W / 2);
      const yy = y + linha * 9;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TINTA_FRACA);
      doc.text(rotulo.toUpperCase(), x, yy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...TINTA);
      const largura = CONTENT_W / 2 - 10;
      doc.text(doc.splitTextToSize(valor || '—', largura)[0] || '—', x, yy + 4.5);
    });
    y += altura + 4;
  };

  /** Uma linha larga (endereço não cabe em meia coluna). */
  const blocoLargo = (rotulo: string, valor: string) => {
    const texto = doc.splitTextToSize(valor || '—', CONTENT_W - 10) as string[];
    const altura = texto.length * 5 + 10;
    espaco(altura + 4);
    doc.setFillColor(...BLOCO);
    doc.roundedRect(MARGIN, y - 4, CONTENT_W, altura, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TINTA_FRACA);
    doc.text(rotulo.toUpperCase(), MARGIN + 5, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(texto, MARGIN + 5, y + 4.5);
    y += altura + 4;
  };

  // TUDO OU NADA entre o formato novo e o antigo — a decisão vive em
  // src/lib/endereco.ts, e é a MESMA das telas. Duas regras divergiriam.
  const fonteEndereco = estruturadoOuAntigo(evento, cliente);
  const endereco = formatarEndereco(fonteEndereco);

  // ---------- 1. O EVENTO ----------
  secao('Informações do evento');
  bloco([
    ['Cliente', evento.client_name],
    ['Telefone', evento.phone || '—'],
    ['Data', formatDate(evento.event_date)],
    ['Tema', evento.theme || '—'],
    ['Chegada para montagem', evento.setup_time || '—'],
    ['Início da festa', evento.start_time || '—'],
  ]);

  // ---------- 2. MONTAGEM ----------
  secao('Informações de montagem');
  blocoLargo('Endereço da montagem', endereco);

  // ---------- 3. CLIENTE E VALORES (só no contrato) ----------
  // A variante 'equipe' pula esta seção inteira: quem carrega o caminhão não
  // precisa do CPF da cliente nem do valor fechado.
  if (!equipe) {
    secao('Dados do cliente');
    bloco([
      ['Nome', cliente?.name || evento.client_name],
      ['Telefone', cliente?.phone || evento.phone || '—'],
      ['E-mail', cliente?.email || '—'],
      ['CPF', cliente?.cpf || '—'],
    ]);
  }

  if (evento.observation) {
    secao('Observações');
    blocoLargo('Anotações', evento.observation);
  }

  // ---------- TABELA DE ITENS ----------
  secao(equipe ? 'Peças a carregar' : 'Itens inclusos');
  {
    espaco(18);
    const colQtd = MARGIN + 4;
    const colNome = MARGIN + 22;
    const colFim = PAGE_W - MARGIN - 4;

    doc.setFillColor(...CABECA_TABELA);
    doc.rect(MARGIN, y - 4, CONTENT_W, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('QTD', colQtd, y + 1);
    doc.text('PEÇA / DESCRIÇÃO', colNome, y + 1);
    doc.text(equipe ? 'CARREGADO / CONFERIDO' : 'VALOR', colFim, y + 1, { align: 'right' });
    y += 9;

    const itens = evento.items || [];
    if (!itens.length) {
      doc.setTextColor(...TINTA_FRACA);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Nenhuma peça registrada.', colNome, y + 1);
      y += 8;
    }

    itens.forEach((item, i) => {
      espaco(10);
      if (i % 2 === 1) {
        doc.setFillColor(...LINHA_PAR);
        doc.rect(MARGIN, y - 4, CONTENT_W, 8, 'F');
      }
      doc.setTextColor(...TINTA);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${item.quantity}`, colQtd, y + 1);
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(item.name, 95)[0] || '', colNome, y + 1);

      if (equipe) {
        // Duas caixas para marcar à caneta durante o carregamento.
        doc.setDrawColor(...TINTA_FRACA);
        doc.setLineWidth(0.25);
        doc.rect(colFim - 32, y - 2.4, 3.4, 3.4);
        doc.rect(colFim - 14, y - 2.4, 3.4, 3.4);
        doc.setFontSize(7);
        doc.setTextColor(...TINTA_FRACA);
        doc.text('carregado', colFim - 27.5, y + 0.6);
        doc.text('conferido', colFim - 9.5, y + 0.6);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(item.price ?? 0), colFim, y + 1, { align: 'right' });
      }
      y += 8;
    });

    doc.setDrawColor(...BORDA);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y - 4, PAGE_W - MARGIN, y - 4);
    y += 2;

    // O TOTAL só existe no contrato. É a diferença que justifica a variante.
    if (!equipe) {
      espaco(12);
      doc.setFillColor(...PETROLEO);
      doc.roundedRect(PAGE_W - MARGIN - 68, y - 3, 68, 11, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('VALOR TOTAL', PAGE_W - MARGIN - 63, y + 1);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(formatCurrency(Number(evento.total_value) || 0), PAGE_W - MARGIN - 4, y + 4.5, { align: 'right' });
      y += 14;
    }
    y += 4;
  }

  // ---------- ETAPAS EM CARTÕES ----------
  secao('Escopo da montagem');
  {
    const etapas: [string, string, string[]][] = [
      ['A', 'Carregamento', [
        'Conferir todas as quantidades antes de embarcar.',
        'Usar mantas de proteção para mobiliários.',
      ]],
      ['B', `Montagem — chegada às ${evento.setup_time || '—'}`, [
        `Montagem no endereço: ${endereco || '—'}.`,
        `Concluir até ${evento.start_time || '—'}, início da festa.`,
      ]],
      ['C', 'Desmontagem e retorno', [
        'Contabilizar todas as peças na presença do responsável.',
        'Registrar avarias no sistema SB Gestor.',
      ]],
    ];

    for (const [letra, titulo, linhas] of etapas) {
      const texto = linhas.flatMap((l) => doc.splitTextToSize(l, CONTENT_W - 26) as string[]);
      const altura = texto.length * 4.6 + 12;
      espaco(altura + 3);

      doc.setFillColor(...BLOCO);
      doc.roundedRect(MARGIN, y - 4, CONTENT_W, altura, 2, 2, 'F');
      // Letra identificadora em quadrado petróleo.
      doc.setFillColor(...PETROLEO);
      doc.roundedRect(MARGIN + 4, y - 1, 8, 8, 1.5, 1.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(letra, MARGIN + 8, y + 4.6, { align: 'center' });

      doc.setTextColor(...TINTA);
      doc.setFontSize(9.5);
      doc.text(titulo, MARGIN + 16, y + 1);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...TINTA_FRACA);
      doc.text(texto, MARGIN + 16, y + 6.5);
      y += altura + 3;
    }
  }

  rodape(doc);
}

/** Nome do arquivo — separado para o teste poder conferir sem gerar o PDF. */
export function nomeDoArquivo(evento: PartyEvent, variante: VarianteDocumento): string {
  const data = evento.event_date?.includes('T') ? evento.event_date.split('T')[0] : evento.event_date;
  const prefixo = variante === 'equipe' ? 'MONTAGEM' : 'ORCAMENTO';
  return `${prefixo}_${(evento.client_name || 'evento').replace(/\s+/g, '_')}_${data}.pdf`;
}

/** Invólucro de IO: cria o jsPDF, manda desenhar e salva. */
export async function gerarDocumentoPDF(
  evento: PartyEvent,
  cliente: Client | null,
  decoradora: Decorator | null,
  variante: VarianteDocumento,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  desenharDocumento(doc, evento, cliente, decoradora, variante);
  doc.save(nomeDoArquivo(evento, variante));
}

/** Assinatura do produto, no pé de toda página. */
function rodape(doc: Doc) {
  const yy = PAGE_H - 12;
  doc.setDrawColor(...BORDA);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, yy - 4, PAGE_W - MARGIN, yy - 4);
  desenharLogo(doc, MARGIN + 2.5, yy + 0.5, 2.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TINTA_FRACA);
  doc.text('Gerado pelo SB Gestor', MARGIN + 7, yy + 2);
  doc.text(`Página ${doc.getNumberOfPages()}`, PAGE_W - MARGIN, yy + 2, { align: 'right' });
}
