import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { TicketCardData } from '@/components/public/TicketCard';
import { renderTicketVisual } from '@/lib/ticketVisualRenderer';

interface GenerateTicketPdfParams {
  ticket: TicketCardData;
  qrBase64: string;
  ticketElement?: HTMLElement | null;
}

async function waitForTicketExportAssets(ticketElement: HTMLElement) {
  // Garante que fontes web e imagens reais da passagem estejam prontas antes da captura.
  // Sem esta espera, o html2canvas pode rasterizar com fallback de fonte, logo ausente
  // ou QR Code ainda não pintado no canvas.
  await document.fonts?.ready;

  const images = Array.from(ticketElement.querySelectorAll('img'));
  await Promise.all(
    images.map(async (image) => {
      if (image.complete) return;

      try {
        if (typeof image.decode === 'function') {
          await image.decode();
          return;
        }
      } catch {
        // Mantém a exportação possível mesmo se uma imagem remota falhar; o onError da UI
        // continua responsável por esconder imagens inválidas sem reconstruir o layout.
      }

      await new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }),
  );

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function copyCanvasPixelsToClone(sourceElement: HTMLElement, clonedElement: HTMLElement) {
  const sourceCanvases = Array.from(sourceElement.querySelectorAll('canvas'));
  const clonedCanvases = Array.from(clonedElement.querySelectorAll('canvas'));

  sourceCanvases.forEach((sourceCanvas, index) => {
    const clonedCanvas = clonedCanvases[index];
    if (!clonedCanvas) return;

    clonedCanvas.width = sourceCanvas.width;
    clonedCanvas.height = sourceCanvas.height;
    clonedCanvas.style.width = sourceCanvas.style.width;
    clonedCanvas.style.height = sourceCanvas.style.height;

    const clonedContext = clonedCanvas.getContext('2d');
    clonedContext?.drawImage(sourceCanvas, 0, 0);
  });
}

function applyTicketExportMode(clonedElement: HTMLElement, width: number) {
  clonedElement.classList.add('ticket-export-mode');
  clonedElement.dataset.ticketExportMode = 'true';
  clonedElement.style.width = `${width}px`;
  clonedElement.style.maxWidth = `${width}px`;
  clonedElement.style.minWidth = `${width}px`;
  clonedElement.style.height = 'auto';
  clonedElement.style.boxSizing = 'border-box';

  clonedElement.querySelectorAll('[data-pdf-exclude="true"], [data-export-hidden="true"]').forEach((element) => {
    // Oculta somente no clone exportado: a passagem virtual em tela permanece intacta.
    (element as HTMLElement).style.display = 'none';
  });

  clonedElement.querySelectorAll('[data-ticket-company-logo-box="true"]').forEach((box) => {
    const boxEl = box as HTMLElement;
    boxEl.style.width = '112px';
    boxEl.style.height = '112px';
    boxEl.style.minWidth = '112px';
    boxEl.style.maxWidth = '112px';
    boxEl.style.display = 'flex';
    boxEl.style.alignItems = 'center';
    boxEl.style.justifyContent = 'center';
    boxEl.style.overflow = 'hidden';
    boxEl.style.backgroundColor = '#ffffff';
    boxEl.style.borderRadius = '16px';
    boxEl.style.boxSizing = 'border-box';
    boxEl.style.padding = '8px';
    boxEl.style.flexShrink = '0';
  });

  clonedElement.querySelectorAll('[data-ticket-company-logo="true"]').forEach((logo) => {
    const logoEl = logo as HTMLImageElement;
    logoEl.style.width = 'auto';
    logoEl.style.height = 'auto';
    logoEl.style.maxWidth = '100%';
    logoEl.style.maxHeight = '100%';
    logoEl.style.objectFit = 'contain';
    logoEl.style.objectPosition = 'center';
    logoEl.style.display = 'block';
    logoEl.style.boxSizing = 'border-box';
  });

  clonedElement.querySelectorAll('[data-ticket-pdf-footer="true"]').forEach((footer) => {
    const footerEl = footer as HTMLElement;
    footerEl.style.fontFamily = 'Arial, Helvetica, sans-serif';
    footerEl.style.letterSpacing = 'normal';
    footerEl.style.wordSpacing = 'normal';
    footerEl.style.fontStretch = 'normal';
    footerEl.style.lineHeight = '20px';
    footerEl.style.whiteSpace = 'normal';
    footerEl.style.wordBreak = 'normal';
    footerEl.style.overflowWrap = 'break-word';

    footerEl.querySelectorAll('p').forEach((paragraph) => {
      const el = paragraph as HTMLElement;
      el.style.margin = '0 0 8px 0';
      el.style.fontFamily = 'Arial, Helvetica, sans-serif';
      el.style.letterSpacing = 'normal';
      el.style.wordSpacing = 'normal';
      el.style.fontStretch = 'normal';
      el.style.lineHeight = '20px';
      el.style.whiteSpace = 'normal';
      el.style.wordBreak = 'normal';
      el.style.overflowWrap = 'break-word';
    });
  });
}

export async function generateTicketPdf({ ticket, qrBase64, ticketElement }: GenerateTicketPdfParams) {
  if (ticketElement) {
    await waitForTicketExportAssets(ticketElement);

    // Fonte de verdade visual da passagem: o próprio TicketCard em tela, clonado em uma
    // área offscreen com a mesma largura real. Isso preserva responsividade, altura e
    // escala visual sem reconstruir um segundo layout para o PDF.
    const ticketWidth = Math.ceil(ticketElement.getBoundingClientRect().width || ticketElement.offsetWidth || 420);
    const exportElement = ticketElement.cloneNode(true) as HTMLElement;
    copyCanvasPixelsToClone(ticketElement, exportElement);
    applyTicketExportMode(exportElement, ticketWidth);

    const exportHost = document.createElement('div');
    exportHost.style.position = 'fixed';
    exportHost.style.left = '-10000px';
    exportHost.style.top = '0';
    exportHost.style.width = `${ticketWidth}px`;
    exportHost.style.pointerEvents = 'none';
    exportHost.style.zIndex = '-1';
    exportHost.appendChild(exportElement);
    document.body.appendChild(exportHost);

    try {
      await waitForTicketExportAssets(exportElement);
      const ticketHeight = Math.ceil(exportElement.scrollHeight || exportElement.getBoundingClientRect().height || 1);
      const domCanvas = await html2canvas(exportElement, {
        backgroundColor: '#ffffff',
        width: ticketWidth,
        height: ticketHeight,
        windowWidth: ticketWidth,
        windowHeight: ticketHeight,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        logging: false,
        scale: Math.max(2, window.devicePixelRatio || 1),
        onclone: (_document, clonedElement) => {
          applyTicketExportMode(clonedElement as HTMLElement, ticketWidth);
        },
        // Evita exportar ações interativas (ex.: botões "Salvar PDF"/"Salvar QR Code") no arquivo final.
        ignoreElements: (element) => (element as HTMLElement).dataset?.pdfExclude === 'true',
      });

      const domImg = domCanvas.toDataURL('image/png', 1.0);
      const doc = new jsPDF({
        orientation: domCanvas.width > domCanvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [domCanvas.width, domCanvas.height],
      });

      doc.addImage(domImg, 'PNG', 0, 0, domCanvas.width, domCanvas.height, undefined, 'FAST');
      doc.save(`passagem-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.pdf`);
    } finally {
      exportHost.remove();
    }
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const qrCanvas = document.createElement('canvas');
  const qrCtx = qrCanvas.getContext('2d');
  const qrImg = new Image();
  qrImg.src = qrBase64;
  await new Promise((resolve, reject) => {
    qrImg.onload = resolve;
    qrImg.onerror = reject;
  });
  qrCanvas.width = qrImg.width;
  qrCanvas.height = qrImg.height;
  qrCtx?.drawImage(qrImg, 0, 0);

  // Fallback seguro: mesmo sem DOM, renderizamos o template oficial (incluindo bloco de benefício
  // quando existir no ticket individual) sem quebrar geração de PDF.
  const ticketCanvas = await renderTicketVisual(ticket, qrCanvas, { width: 1200, backgroundColor: '#ffffff' });
  const ticketImg = ticketCanvas.toDataURL('image/png', 1.0);

  const maxW = pageW - 24;
  const maxH = pageH - 24;
  const ratio = Math.min(maxW / ticketCanvas.width, maxH / ticketCanvas.height);
  const renderW = ticketCanvas.width * ratio;
  const renderH = ticketCanvas.height * ratio;
  const x = (pageW - renderW) / 2;
  const y = (pageH - renderH) / 2;

  doc.addImage(ticketImg, 'PNG', x, y, renderW, renderH, undefined, 'FAST');
  doc.save(`passagem-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.pdf`);
}
