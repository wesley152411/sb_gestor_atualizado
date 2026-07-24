import type { PartyEvent, Client, Decorator } from '@/types';
import { formatDate } from '@/lib/utils';

// ==================== TOKENS VISUAIS ====================
// Mesmos tokens da página pública de orçamento (/orcamento/[token]),
// mantidos aqui para o PDF ficar visualmente consistente com o formulário.
const TERRACOTA: [number, number, number] = [184, 84, 80];      // #B85450
const TEXT_DARK: [number, number, number] = [47, 42, 38];       // #2F2A26
const TEXT_MUTED: [number, number, number] = [138, 128, 120];   // #8A8078
const CREAM_BG: [number, number, number] = [251, 247, 242];     // #FBF7F2
const DASH_COLOR: [number, number, number] = [228, 213, 205];   // #E4D5CD

// Medidas A4 (mm)
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Converte uma URL de imagem (http(s) ou data:) em data URL, para embutir no PDF.
 * Retorna null se não for possível (o PDF segue sem a logo).
 */
async function toDataUrl(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function inferFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
}

export async function generateQuotePDF(
  event: PartyEvent,
  client: Client | null,
  decorator: Decorator | null
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let y = MARGIN;

  // Quebra de página automática, preservando margem inferior
  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // ---------- CABEÇALHO: logo da decoradora ----------
  const logoSource = decorator?.logo_url || decorator?.avatar_url;
  const logoData = await toDataUrl(logoSource);

  if (logoData) {
    try {
      doc.addImage(logoData, inferFormat(logoData), MARGIN, y, 22, 22, undefined, 'FAST');
    } catch {
      /* logo inválida: segue sem imagem */
    }
  } else {
    // Sem logo cadastrada: bloco terracota com as iniciais da empresa
    const initials = (decorator?.name || 'SB').trim().slice(0, 2).toUpperCase();
    doc.setFillColor(...TERRACOTA);
    doc.roundedRect(MARGIN, y, 22, 22, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.text(initials, MARGIN + 11, y + 14, { align: 'center' });
  }

  // Nome da empresa + título do documento
  doc.setTextColor(...TEXT_DARK);
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.text(decorator?.name || 'Orçamento', MARGIN + 28, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Orçamento do evento', MARGIN + 28, y + 16);

  const emissao = new Date().toLocaleDateString('pt-BR');
  doc.text(`Emitido em ${emissao}`, PAGE_W - MARGIN, y + 16, { align: 'right' });

  y += 30;

  // Linha divisória
  doc.setDrawColor(...DASH_COLOR);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // ---------- SEÇÃO: PRODUTO ----------
  const drawSectionTitle = (label: string) => {
    ensureSpace(14);
    // traço terracota antes do título (mesmo padrão da tela)
    doc.setDrawColor(...TERRACOTA);
    doc.setLineWidth(1);
    doc.line(MARGIN, y - 1.5, MARGIN + 6, y - 1.5);
    doc.setTextColor(...TEXT_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(label, MARGIN + 9, y);
    y += 8;
  };

  // ---------- Helper: linhas de campo (label/valor) ----------
  const drawFields = (fields: [string, string][]) => {
    doc.setFontSize(10);
    fields.forEach(([label, value]) => {
      ensureSpace(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.setFont('helvetica', 'normal');
      doc.text(label, MARGIN, y);
      doc.setTextColor(...TEXT_DARK);
      doc.setFont('helvetica', 'bold');
      const wrapped = doc.splitTextToSize(value || '—', CONTENT_W - 45);
      doc.text(wrapped, MARGIN + 45, y);
      y += Array.isArray(wrapped) && wrapped.length > 1 ? wrapped.length * 5 + 2 : 7;
    });
    y += 3;
  };

  // ---------- SEÇÃO: PRODUTO / SERVIÇO (sem valores) ----------
  drawSectionTitle('Produto / Serviço');
  {
    const cardHeight = 20;
    ensureSpace(cardHeight + 4);
    doc.setFillColor(...CREAM_BG);
    doc.roundedRect(MARGIN, y - 5, CONTENT_W, cardHeight, 3, 3, 'F');
    doc.setTextColor(...TEXT_DARK);
    doc.setFont('times', 'bold');
    doc.setFontSize(15);
    doc.text(event.theme || 'Evento', MARGIN + 5, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Orçamento gerado a partir do link enviado à cliente.', MARGIN + 5, y + 8);
    y += cardHeight + 6;
  }

  // ---------- SEÇÃO: DADOS DO CLIENTE ----------
  drawSectionTitle('Dados do cliente');
  drawFields([
    ['Nome completo', event.client_name || client?.name || ''],
    ['Telefone', event.phone || client?.phone || ''],
    ['E-mail', client?.email || ''],
    ['CPF', client?.cpf || ''],
  ]);

  // ---------- SEÇÃO: INFORMAÇÕES DE ENTREGA ----------
  drawSectionTitle('Informações de entrega');
  drawFields([
    ['Endereço', event.address || client?.address || ''],
    ['Data do evento', event.event_date ? formatDate(event.event_date) : ''],
    ['Horário de chegada', event.setup_time || ''],
    ['Horário de início', event.start_time || ''],
  ]);

  // ---------- SEÇÃO: OBSERVAÇÕES ----------
  if (event.observation && event.observation.trim()) {
    drawSectionTitle('Observações');
    const obs = doc.splitTextToSize(event.observation.trim(), CONTENT_W - 10);
    const boxH = obs.length * 5 + 10;
    ensureSpace(boxH + 4);
    doc.setFillColor(...CREAM_BG);
    doc.roundedRect(MARGIN, y - 5, CONTENT_W, boxH, 3, 3, 'F');
    doc.setTextColor(...TEXT_DARK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(obs, MARGIN + 5, y + 1);
    y += boxH + 4;
  }

  // ---------- SEÇÃO: ITENS INCLUSOS (tabela de conferência) ----------
  const items = event.items || [];
  drawSectionTitle('Itens inclusos');
  {
    // Cabeçalho da tabela
    ensureSpace(10);
    doc.setFillColor(...CREAM_BG);
    doc.rect(MARGIN, y - 5, CONTENT_W, 8, 'F');
    doc.setTextColor(...TEXT_MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('QTD', MARGIN + 3, y);
    doc.text('PEÇA / DESCRIÇÃO', MARGIN + 24, y);
    doc.text('STATUS DE CARREGAMENTO', PAGE_W - MARGIN - 3, y, { align: 'right' });
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (items.length === 0) {
      doc.setTextColor(...TEXT_MUTED);
      doc.text('Nenhum item cadastrado.', MARGIN + 3, y);
      y += 7;
    } else {
      items.forEach((item) => {
        ensureSpace(10);
        doc.setTextColor(...TEXT_DARK);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`${item.quantity} un`, MARGIN + 3, y);
        const nameLines = doc.splitTextToSize(item.name, 78);
        doc.text(nameLines, MARGIN + 24, y);

        // Duas checkboxes de conferência: [ ] Carregado  [ ] Conferido
        const boxY = y - 3.2;
        const box1X = PAGE_W - MARGIN - 58;
        const box2X = PAGE_W - MARGIN - 28;
        doc.setDrawColor(...TEXT_MUTED);
        doc.setLineWidth(0.3);
        doc.rect(box1X, boxY, 3.5, 3.5);
        doc.rect(box2X, boxY, 3.5, 3.5);
        doc.setTextColor(...TEXT_MUTED);
        doc.setFontSize(8.5);
        doc.text('Carregado', box1X + 5, y);
        doc.text('Conferido', box2X + 5, y);

        const rowH = Array.isArray(nameLines) && nameLines.length > 1 ? nameLines.length * 5 + 3 : 8;
        y += rowH;
        doc.setDrawColor(...DASH_COLOR);
        doc.setLineWidth(0.2);
        doc.line(MARGIN, y - 2.5, PAGE_W - MARGIN, y - 2.5);
      });
    }
    y += 6;
  }

  // ---------- SEÇÃO: ESCOPO LOGÍSTICO PARA A EQUIPE ----------
  drawSectionTitle('Escopo logístico para a equipe');
  {
    const arrival = event.setup_time || '—';
    const start = event.start_time || '—';
    const addr = event.address || client?.address || '—';

    const drawStage = (title: string, lines: string[]) => {
      ensureSpace(8 + lines.length * 6);
      doc.setTextColor(...TEXT_DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(title, MARGIN, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT_MUTED);
      lines.forEach((ln) => {
        const wrapped = doc.splitTextToSize(`•  ${ln}`, CONTENT_W - 6);
        doc.text(wrapped, MARGIN + 3, y);
        y += (Array.isArray(wrapped) ? wrapped.length : 1) * 5 + 1;
      });
      y += 3;
    };

    // Dados entre colchetes puxados dinamicamente do evento (não fixos).
    drawStage('Etapa A — Carregamento no Almoxarifado:', [
      'Conferir todas as quantidades antes de embarcar.',
      'Usar mantas de proteção para mobiliários.',
    ]);
    drawStage(`Etapa B — Montagem (Chegada às ${arrival}):`, [
      `Entrega no endereço: ${addr}.`,
      `Montar tudo até às ${start} (início da festa).`,
    ]);
    drawStage('Etapa C — Desmontagem e Retorno:', [
      'Contabilizar todas as peças na presença do responsável.',
      'Registrar avarias no sistema SB GESTOR.',
    ]);
  }

  // ---------- RODAPÉ em todas as páginas ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...DASH_COLOR);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(decorator?.name || '', MARGIN, PAGE_H - 9);
    doc.text(`Página ${i} de ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' });
  }

  // ---------- NOME DO ARQUIVO ----------
  const slug = (event.client_name || 'cliente')
    .normalize('NFD')
    // NFD separa o acento em marca combinante; o filtro abaixo remove tudo
    // que não é alfanumérico, incluindo essas marcas ("José" -> "jose").
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const dateOnly = event.event_date?.includes('T')
    ? event.event_date.split('T')[0]
    : event.event_date || new Date().toISOString().split('T')[0];

  doc.save(`orcamento-${slug}-${dateOnly}.pdf`);
}
