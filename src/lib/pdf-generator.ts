import type { PartyEvent } from '@/types';

export function generateLogisticsPDF(eventData: PartyEvent) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF();
    const primary: [number, number, number] = [79, 70, 229];
    const secondary: [number, number, number] = [15, 23, 42];
    const lightGray: [number, number, number] = [248, 250, 252];

    // Header
    doc.setFillColor(...primary);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('SB GESTOR - Logística B2B', 14, 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('CHECKLIST DE MONTAGEM E LOGÍSTICA PARA EQUIPE', 14, 29);

    // Section 1: Info
    doc.setTextColor(...secondary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('1. INFORMAÇÕES GERAIS DO CONTRATO', 14, 48);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 52, 196, 52);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let y = 58;
    const dateFormatted = new Date(eventData.event_date + 'T00:00:00').toLocaleDateString('pt-BR');

    const rows: [string, string, string, string][] = [
      ['Cliente:', eventData.client_name, 'Telefone:', eventData.phone],
      ['Tema:', eventData.theme, 'Valor:', `R$ ${eventData.total_value.toFixed(2)}`],
      ['Data:', dateFormatted, 'Status:', eventData.status],
      ['Montagem:', eventData.setup_time, 'Início:', eventData.start_time],
      ['Local:', eventData.address, '', ''],
    ];

    rows.forEach((row) => {
      doc.setFont('helvetica', 'bold');
      doc.text(row[0], 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(row[1], 48, y);
      if (row[2]) {
        doc.setFont('helvetica', 'bold');
        doc.text(row[2], 115, y);
        doc.setFont('helvetica', 'normal');
        doc.text(row[3], 150, y);
      }
      y += 7;
    });

    y += 4;

    // Section 2: Items
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('2. PEÇAS DO ACERVO A SEREM CARREGADAS', 14, y);
    y += 4;
    doc.line(14, y, 196, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFillColor(...lightGray);
    doc.rect(14, y - 5, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Qtd', 18, y);
    doc.text('Peça / Descrição', 36, y);
    doc.text('Status de Carregamento', 130, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    eventData.items.forEach((item) => {
      doc.line(14, y - 5, 196, y - 5);
      doc.text(`${item.quantity} un`, 18, y);
      doc.text(item.name, 36, y);
      doc.rect(130, y - 4, 4, 4);
      doc.setFontSize(8);
      doc.text('[  ] Carregado   [  ] Conferido', 138, y - 1);
      doc.setFontSize(10);
      y += 8;
    });
    doc.line(14, y - 5, 196, y - 5);
    y += 6;

    // Section 3: Logistics scope
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('3. ESCOPO LOGÍSTICO PARA A EQUIPE', 14, y);
    y += 4;
    doc.line(14, y, 196, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Etapa A - Carregamento no Almoxarifado:', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('- Conferir todas as quantidades antes de embarcar.', 18, y);
    y += 5;
    doc.text('- Usar mantas de proteção para mobiliários.', 18, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text(`Etapa B - Montagem (Chegada às ${eventData.setup_time}):`, 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`- Entrega no endereço: ${eventData.address}.`, 18, y);
    y += 5;
    doc.text(`- Montar tudo até às ${eventData.start_time} (início da festa).`, 18, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Etapa C - Desmontagem e Retorno:', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('- Contabilizar todas as peças na presença do responsável.', 18, y);
    y += 5;
    doc.text('- Registrar avarias no sistema SB GESTOR.', 18, y);

    const filename = `LOGISTICA_${eventData.client_name.replace(/\s+/g, '_')}_${eventData.event_date}.pdf`;
    doc.save(filename);
  });
}
