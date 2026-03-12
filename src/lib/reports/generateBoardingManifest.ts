import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { Company } from '@/types/database';
import {
  getCompanyDisplayName,
  getCompanyPrimaryColor,
  getLogoBase64,
  hexToRgb,
  loadImageAsBase64,
} from '@/lib/pdfUtils';

interface ManifestRow {
  sale_id: string;
  ticket_id: string | null;
  event_id: string;
  event_name: string;
  event_date: string;
  trip_id: string;
  trip_departure_time: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  boarding_location_id: string;
  boarding_location_name: string;
  stop_order: number | null;
  departure_time: string | null;
  passenger_name: string;
  passenger_phone: string | null;
  seat_label: string;
}

interface GenerateBoardingManifestParams {
  eventId: string;
  tripId?: string | null;
  companyId: string;
  company: Company | null;
}

interface GroupedManifest {
  groupTitle: string;
  stopOrder: number;
  departureTime: string;
  passengers: ManifestRow[];
}

const FOOTER_TEXT = 'SmartBus BR - Documento operacional de embarque - Contato: (65) 99210-2030';

const formatDateBR = (dateIso: string) => {
  if (!dateIso) return '-';
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString('pt-BR');
};

const formatTime = (time: string | null) => (time ? time.slice(0, 5) : '--:--');

const normalizeSeatForSort = (seat: string) => {
  const numericValue = Number(String(seat).replace(/[^0-9]/g, ''));
  if (!Number.isNaN(numericValue) && numericValue > 0) {
    return numericValue.toString().padStart(4, '0');
  }
  return `ZZZ-${seat}`;
};

/**
 * Gera o PDF operacional da Lista de Embarque agrupando passageiros por ponto.
 * Comentário de suporte: usamos RPC única para reduzir round-trips e evitar divergência de ordenação.
 */
export async function generateBoardingManifest({
  eventId,
  tripId = null,
  companyId,
  company,
}: GenerateBoardingManifestParams) {
  const { data, error } = await supabase.rpc('get_boarding_manifest_rows', {
    p_company_id: companyId,
    p_event_id: eventId,
    p_trip_id: tripId,
  });

  if (error) {
    throw new Error(error.message || 'Não foi possível carregar os dados do manifesto.');
  }

  const rows = (data ?? []) as ManifestRow[];
  if (rows.length === 0) {
    throw new Error('Nenhum passageiro pago encontrado para os filtros selecionados.');
  }

  const sortedRows = [...rows].sort((a, b) => {
    const orderDiff = (a.stop_order ?? 9999) - (b.stop_order ?? 9999);
    if (orderDiff !== 0) return orderDiff;

    const timeDiff = formatTime(a.departure_time).localeCompare(formatTime(b.departure_time));
    if (timeDiff !== 0) return timeDiff;

    return normalizeSeatForSort(a.seat_label).localeCompare(normalizeSeatForSort(b.seat_label));
  });

  const groupedMap = new Map<string, GroupedManifest>();
  for (const row of sortedRows) {
    const groupKey = `${row.boarding_location_id}::${row.trip_id}`;
    const existing = groupedMap.get(groupKey);

    if (!existing) {
      groupedMap.set(groupKey, {
        groupTitle: row.boarding_location_name,
        stopOrder: row.stop_order ?? 9999,
        departureTime: formatTime(row.departure_time),
        passengers: [row],
      });
      continue;
    }

    existing.passengers.push(row);
  }

  const groups = Array.from(groupedMap.values()).sort((a, b) => {
    const orderDiff = a.stopOrder - b.stopOrder;
    if (orderDiff !== 0) return orderDiff;
    return a.departureTime.localeCompare(b.departureTime);
  });

  const firstRow = rows[0];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const primaryColor = hexToRgb(getCompanyPrimaryColor(company));

  let logoBase64: string | null = null;
  try {
    logoBase64 = company?.logo_url ? await loadImageAsBase64(company.logo_url) : null;
    if (!logoBase64) {
      logoBase64 = await getLogoBase64();
    }
  } catch {
    // Fallback silencioso para o cabeçalho sem imagem.
    logoBase64 = null;
  }

  const drawFooter = () => {
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFontSize(7.5);
      doc.setTextColor(110, 110, 110);
      doc.text(FOOTER_TEXT, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }
  };

  const drawDocumentHeader = () => {
    let cursorY = margin;

    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', margin, cursorY, 18, 18);
    }

    const leftX = logoBase64 ? margin + 22 : margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text(getCompanyDisplayName(company), leftX, cursorY + 6);

    doc.setFontSize(17);
    doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.text('LISTA DE EMBARQUE', pageWidth - margin, cursorY + 7, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text('Manifesto de Passageiros', pageWidth - margin, cursorY + 13, { align: 'right' });

    cursorY += 24;
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(`Evento: ${firstRow.event_name}`, margin, cursorY);
    doc.text(`Data: ${formatDateBR(firstRow.event_date)}`, margin, cursorY + 5);

    const vehicleLabel = firstRow.vehicle_plate
      ? `${firstRow.vehicle_type ?? 'Veiculo'} - ${firstRow.vehicle_plate}`
      : firstRow.vehicle_type ?? 'Não informado';
    doc.text(`Veículo: ${vehicleLabel}`, margin, cursorY + 10);
    doc.text('Motorista: ______________________', margin, cursorY + 15);

    doc.setDrawColor(220, 220, 220);
    doc.line(margin, cursorY + 18, pageWidth - margin, cursorY + 18);
    return cursorY + 24;
  };

  let currentY = drawDocumentHeader();

  groups.forEach((group, index) => {
    const tableRows = group.passengers.map((passenger) => [
      '[ ]',
      passenger.seat_label,
      passenger.passenger_name,
      passenger.passenger_phone || '-',
    ]);

    const drawGroupTitle = (y: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20, 20, 20);

      // Bloco de destaque para facilitar leitura rápida em operação de prancheta.
      doc.setFillColor(247, 247, 247);
      doc.roundedRect(margin, y - 4.5, pageWidth - margin * 2, 11.5, 1.6, 1.6, 'F');
      doc.text(`Ponto de Embarque: ${group.groupTitle}`, margin + 2, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(
        `Horario: ${group.departureTime}   |   Passageiros: ${group.passengers.length}`,
        margin + 2,
        y + 5,
      );
    };

    if (index > 0 && currentY > pageHeight - 80) {
      doc.addPage();
      currentY = margin;
    }

    // Primeira página do grupo usa a posição corrente do fluxo.
    drawGroupTitle(currentY);

    autoTable(doc, {
      startY: currentY + 9,
      head: [['Check', 'Poltrona', 'Passageiro', 'Telefone']],
      body: tableRows,
      margin: { left: margin, right: margin, top: margin },
      showHead: 'everyPage',
      styles: {
        fontSize: 9,
        cellPadding: 2,
        overflow: 'linebreak',
        textColor: [20, 20, 20],
        lineColor: [228, 228, 228],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [236, 236, 236],
        textColor: [40, 40, 40],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 252, 252],
      },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center' },
        1: { cellWidth: 24, halign: 'center' },
        2: { cellWidth: 86 },
        3: { cellWidth: 48, halign: 'left' },
      },
      didDrawPage: (hookData) => {
        // Sempre redesenha o cabeçalho do grupo quando a tabela quebra de página.
        if (hookData.pageNumber > 1) {
          drawGroupTitle(margin);
          hookData.cursor.y = margin + 9;
        }
      },
      willDrawCell: (hookData) => {
        // Mantém a tabela compacta para caber ~30-35 passageiros por página A4.
        if (hookData.section === 'body') {
          hookData.cell.styles.minCellHeight = 6.4;
        }
      },
    });

    const tableState = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    currentY = (tableState?.finalY ?? currentY) + 8;
  });

  if (currentY > pageHeight - 55) {
    doc.addPage();
    currentY = margin;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Resumo do Embarque', margin, currentY);

  // Caixa visual para o resumo final e anotações do motorista.
  doc.setDrawColor(215, 215, 215);
  doc.roundedRect(margin, currentY + 2, pageWidth - margin * 2, 58, 1.6, 1.6, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total de passageiros: ${rows.length}`, margin + 2, currentY + 10);
  doc.text('Embarcados: __________', margin + 2, currentY + 17);
  doc.text('Ausentes: __________', margin + 2, currentY + 24);
  doc.text('Observacoes do motorista:', margin + 2, currentY + 33);
  doc.text('______________________________________________________________', margin + 2, currentY + 40);
  doc.text('______________________________________________________________', margin + 2, currentY + 47);
  doc.text('Assinatura do motorista: ______________________', margin + 2, currentY + 56);

  drawFooter();

  const fileName = `lista-embarque-${firstRow.event_name.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  doc.save(fileName);
}
