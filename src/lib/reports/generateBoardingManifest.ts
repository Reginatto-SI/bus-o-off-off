import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { Company } from '@/types/database';
import {
  formatCnpj,
  getCompanyDisplayName,
  getCompanyPrimaryColor,
  getLogoBase64,
  hexToRgb,
  loadImageAsBase64,
} from '@/lib/pdfUtils';

export interface ManifestRow {
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

interface FetchBoardingManifestRowsParams {
  eventId: string;
  tripId?: string | null;
  companyId: string;
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

const formatDateForFileName = (dateIso: string) => {
  if (!dateIso) return 'sem-data';
  const [year, month, day] = dateIso.split('-');
  if (!year || !month || !day) return 'sem-data';
  return `${day}-${month}-${year}`;
};

const formatTime = (time: string | null) => (time ? time.slice(0, 5) : '--:--');

const normalizeSeatForSort = (seat: string) => {
  const numericValue = Number(String(seat).replace(/[^0-9]/g, ''));
  if (!Number.isNaN(numericValue) && numericValue > 0) {
    return numericValue.toString().padStart(4, '0');
  }
  return `ZZZ-${seat}`;
};

const sanitizeForFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const sanitizePlateForFileName = (value: string | null) => {
  if (!value) return '';
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
};

const formatPhoneForPrint = (value: string | null) => {
  if (!value) return '-';

  // Comentário de suporte: mantém somente dígitos para padronizar telefones vindos de fontes heterogêneas.
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return value;
};

/**
 * Monta linhas institucionais/comerciais para o cabeçalho do manifesto.
 * Comentário de suporte: somente campos comerciais públicos; ausência de dados não quebra o layout.
 */
const buildCompanyHeaderLines = (company: Company | null) => {
  if (!company) return [];

  const lines: string[] = [];
  const displayName = getCompanyDisplayName(company);
  const legalName = company.legal_name?.trim();

  if (legalName && legalName.toLowerCase() !== displayName.toLowerCase()) {
    lines.push(`Razão social: ${legalName}`);
  }

  const formattedCnpj = formatCnpj(company.cnpj || company.document_number || null);
  if (formattedCnpj) {
    lines.push(`CNPJ: ${formattedCnpj}`);
  }

  const addressParts = [company.address, company.address_number, company.province]
    .map((part) => part?.trim())
    .filter(Boolean);
  if (addressParts.length > 0) {
    lines.push(`Endereço: ${addressParts.join(', ')}`);
  }

  const cityState = [company.city, company.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' / ');
  if (cityState) {
    lines.push(`Cidade/UF: ${cityState}`);
  }

  const formattedPhone = formatPhoneForPrint(company.phone || null);
  if (formattedPhone !== '-') {
    lines.push(`Telefone: ${formattedPhone}`);
  }

  const email = company.email?.trim();
  if (email) {
    lines.push(`E-mail: ${email}`);
  }

  return lines;
};

/**
 * Reaproveita a mesma RPC do PDF para manter consistência entre preview e documento final.
 */
export async function fetchBoardingManifestRows({
  eventId,
  tripId = null,
  companyId,
}: FetchBoardingManifestRowsParams): Promise<ManifestRow[]> {
  const { data, error } = await supabase.rpc('get_boarding_manifest_rows', {
    p_company_id: companyId,
    p_event_id: eventId,
    p_trip_id: tripId,
  });

  if (error) {
    throw new Error(error.message || 'Não foi possível carregar os dados do manifesto.');
  }

  return (data ?? []) as ManifestRow[];
}

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
  const rows = await fetchBoardingManifestRows({ eventId, tripId, companyId });
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
    const companyHeaderLines = buildCompanyHeaderLines(company);

    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', margin, cursorY, 18, 18);
    }

    const leftX = logoBase64 ? margin + 22 : margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text(getCompanyDisplayName(company), leftX, cursorY + 6);

    if (companyHeaderLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(70, 70, 70);
      doc.text(companyHeaderLines, leftX, cursorY + 10.5, {
        maxWidth: pageWidth - margin * 2 - 82,
        lineHeightFactor: 1.18,
      });
    }

    doc.setFontSize(17);
    doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.text('LISTA DE EMBARQUE', pageWidth - margin, cursorY + 7, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text('Manifesto de Passageiros', pageWidth - margin, cursorY + 13, { align: 'right' });

    const companyDetailsHeight = companyHeaderLines.length * 3.5;
    cursorY += Math.max(24, 11 + companyDetailsHeight);

    // Comentário de suporte: reforça separação visual entre bloco institucional e dados operacionais do evento.
    doc.setDrawColor(232, 232, 232);
    doc.setLineWidth(0.4);
    doc.line(margin, cursorY + 1, pageWidth - margin, cursorY + 1);

    // Comentário de suporte: respiro extra para evitar sensação de conteúdo "grudado" após incluir dados comerciais.
    cursorY += 6;
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(`Evento: ${firstRow.event_name}`, margin, cursorY);
    doc.text(`Data: ${formatDateBR(firstRow.event_date)}`, margin, cursorY + 5);
    doc.text(`Veiculo: ${firstRow.vehicle_type ?? 'Nao informado'}`, margin, cursorY + 10);
    doc.text(`Placa: ${firstRow.vehicle_plate ?? 'Nao informada'}`, margin, cursorY + 15);
    doc.text('Motorista: ______________________', margin, cursorY + 20);

    doc.setDrawColor(220, 220, 220);
    doc.line(margin, cursorY + 23, pageWidth - margin, cursorY + 23);
    return cursorY + 27;
  };

  let currentY = drawDocumentHeader();

  groups.forEach((group, index) => {
    const tableRows = group.passengers.map((passenger) => [
      '',
      '',
      '',
      passenger.seat_label,
      passenger.passenger_name,
      formatPhoneForPrint(passenger.passenger_phone),
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
      head: [['E', 'D', 'R', 'Poltrona', 'Passageiro', 'Telefone']],
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
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 10, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 88 },
        5: { cellWidth: 48, halign: 'left' },
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

  if (currentY > pageHeight - 68) {
    doc.addPage();
    currentY = margin;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Resumo do Embarque', margin, currentY);

  // Caixa visual para o resumo final e anotações do motorista.
  doc.setDrawColor(215, 215, 215);
  doc.roundedRect(margin, currentY + 2, pageWidth - margin * 2, 66, 1.6, 1.6, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total de passageiros: ${rows.length}`, margin + 2, currentY + 10);
  doc.text('Embarcados: __________', margin + 2, currentY + 17);
  doc.text('Desembarcados: __________', margin + 2, currentY + 24);
  doc.text('Reembarcados: __________', margin + 2, currentY + 31);
  doc.text('Observacoes do motorista:', margin + 2, currentY + 40);
  doc.text('______________________________________________________________', margin + 2, currentY + 47);
  doc.text('______________________________________________________________', margin + 2, currentY + 54);
  doc.text('Assinatura do motorista: ______________________', margin + 2, currentY + 61);

  drawFooter();

  // Comentário de suporte: nome do arquivo prioriza identificação operacional (evento/data/placa).
  const fileNameParts = [
    'lista-embarque',
    sanitizeForFileName(firstRow.event_name) || 'evento',
    formatDateForFileName(firstRow.event_date),
  ];
  const sanitizedPlate = sanitizePlateForFileName(firstRow.vehicle_plate);
  if (sanitizedPlate) {
    fileNameParts.push(sanitizedPlate);
  }

  doc.save(`${fileNameParts.join('-')}.pdf`);
}
