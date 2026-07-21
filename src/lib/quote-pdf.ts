import type { PartyEvent, Client, Decorator } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

// ==================== TOKENS VISUAIS ====================
// Mesmos tokens da página pública de orçamento (/orcamento/[token]),
// mantidos aqui para o PDF ficar visualmente consistente com o formulário.
const TERRACOTA: [number, number, number] = [184, 84, 80];      // #B85450
const TEXT_DARK: [number, number, number] = [47, 42, 38];       // #2F2A26
const TEXT_MUTED: [number, number, number] = [138, 128, 120];   // #8A8078
const CREAM_BG: [number, number, number] = [251, 247, 242];     // #FBF7F2
const PINK_BG: [number, number, number] = [251, 228, 224];      // #FBE4E0
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

  drawSectionTitle('Produto / Serviço');

  const cardHeight = 24;
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
  const desc = doc.splitTextToSize('Orçamento gerado a partir do link enviado à cliente.', CONTENT_W - 50);
  doc.text(desc, MARGIN + 5, y + 8);

  doc.setTextColor(...TERRACOTA);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.text(formatCurrency(Number(event.total_value) || 0), PAGE_W - MARGIN - 5, y + 2, { align: 'right' });

  y += cardHeight + 6;

  // ---------- SEÇÃO: ITENS INCLUSOS ----------
  const items = event.items || [];
  if (items.length > 0) {
    drawSectionTitle('Itens inclusos');

    doc.setFontSize(10);
    items.forEach((item) => {
      ensureSpace(8);
      // bullet terracota
      doc.setFillColor(...TERRACOTA);
      doc.circle(MARGIN + 2, y - 1, 1, 'F');

      doc.setTextColor(...TEXT_DARK);
      doc.setFont('helvetica', 'normal');
      doc.text(item.name, MARGIN + 6, y);

      doc.setTextColor(...TEXT_MUTED);
      doc.text(`x${item.quantity}`, PAGE_W - MARGIN, y, { align: 'right' });

      y += 6;
      doc.setDrawColor(...DASH_COLOR);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y - 2.5, PAGE_W - MARGIN, y - 2.5);
    });
    y += 4;
  }

  // ---------- BARRA: VALOR TOTAL ----------
  ensureSpace(18);
  doc.setFillColor(...PINK_BG);
  doc.roundedRect(MARGIN, y - 5, CONTENT_W, 14, 3, 3, 'F');
  doc.setTextColor(...TEXT_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Valor total', MARGIN + 5, y + 3);
  doc.setTextColor(...TERRACOTA);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text(formatCurrency(Number(event.total_value) || 0), PAGE_W - MARGIN - 5, y + 3.5, { align: 'right' });
  y += 20;

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
