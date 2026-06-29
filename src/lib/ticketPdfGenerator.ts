import jsPDF from 'jspdf';
import { toCanvas as htmlToCanvas } from 'html-to-image';
import type { TicketCardData } from '@/components/public/TicketCard';
import { renderTicketVisual } from '@/lib/ticketVisualRenderer';

interface GenerateTicketPdfParams {
  ticket: TicketCardData;
  qrBase64: string;
  ticketElement?: HTMLElement | null;
}

function isTicketPdfDebugEnabled() {
  try {
    return (
      window.localStorage.getItem('smartbus_ticket_pdf_debug') === 'true' ||
      new URLSearchParams(window.location.search).get('ticketPdfDebug') === '1'
    );
  } catch {
    return false;
  }
}

function logTicketPdfDebug(message: string, data?: Record<string, unknown>) {
  if (!isTicketPdfDebugEnabled()) return;
  // Log de diagnóstico opt-in para confirmar o fluxo real de exportação em produção,
  // sem expor dados sensíveis por padrão no console dos passageiros.
  console.info(`[ticket-pdf] ${message}`, data ?? {});
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

  // Compensa a diferença de medição de texto entre o DOM ao vivo e o <foreignObject> SVG
  // usado pelo html-to-image — sem essa proteção, labels curtos como "Passagem Nº",
  // "Compra em" e "Total pago" quebram em 2 linhas só no PDF, sobrepondo o valor.
  // O alerta de tolerância de embarque é excluído desta regra porque é um texto longo
  // que deve quebrar linhas normalmente.
  clonedElement.querySelectorAll(
    '.flex.items-center > span:not([data-ticket-tolerance-alert] span), .flex.items-start > span:not([data-ticket-tolerance-alert] span), .flex.justify-between > span'
  ).forEach((span) => {
    (span as HTMLElement).style.whiteSpace = 'nowrap';
  });

  clonedElement.querySelectorAll('[data-ticket-tolerance-alert="true"] span').forEach((span) => {
    const spanEl = span as HTMLElement;
    spanEl.style.whiteSpace = 'normal';
    spanEl.style.wordBreak = 'break-word';
    spanEl.style.overflowWrap = 'break-word';
    spanEl.style.display = 'inline';
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
  const fileName = `passagem-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.pdf`;

  logTicketPdfDebug('generateTicketPdf chamado', {
    hasTicketElement: Boolean(ticketElement),
    fileName,
  });

  if (ticketElement) {
    await waitForTicketExportAssets(ticketElement);

    // Fonte de verdade visual da passagem: o próprio TicketCard em tela, clonado em uma
    // área offscreen com a mesma largura real. Isso preserva responsividade, altura e
    // escala visual sem reconstruir um segundo layout para o PDF.
    const ticketWidth = Math.ceil(ticketElement.getBoundingClientRect().width || ticketElement.offsetWidth || 420);
    const ticketHeightBeforeClone = Math.ceil(ticketElement.scrollHeight || ticketElement.getBoundingClientRect().height || 1);
    const excludedElementsCount = ticketElement.querySelectorAll('[data-pdf-exclude="true"], [data-export-hidden="true"]').length;

    logTicketPdfDebug('fluxo clone offscreen iniciado', {
      ticketWidth,
      ticketHeightBeforeClone,
      excludedElementsCount,
    });

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

      logTicketPdfDebug('capturando clone offscreen com html-to-image', {
        ticketWidth,
        ticketHeight,
        fileName,
      });

      const pixelRatio = Math.max(2, window.devicePixelRatio || 1);
      // html-to-image serializa o DOM dentro de um <foreignObject> SVG e deixa o próprio
      // navegador renderizar — o resultado é fiel à passagem virtual em tela, incluindo
      // variáveis CSS, grids modernos, SVGs do lucide-react e o canvas do QR Code.
      const domCanvas = await htmlToCanvas(exportElement, {
        backgroundColor: '#0b1220',
        width: ticketWidth,
        height: ticketHeight,
        pixelRatio,
        cacheBust: true,
        skipFonts: false,
        // Garante que controles interativos nunca apareçam no PDF, mesmo que escapem do CSS de export-mode.
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.dataset?.pdfExclude === 'true') return false;
          if (node.dataset?.exportHidden === 'true') return false;
          return true;
        },
      });

      logTicketPdfDebug('PDF gerado pelo clone offscreen', {
        canvasWidth: domCanvas.width,
        canvasHeight: domCanvas.height,
        fileName,
      });

      const domImg = domCanvas.toDataURL('image/png', 1.0);
      const doc = new jsPDF({
        orientation: domCanvas.width > domCanvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [domCanvas.width, domCanvas.height],
      });

      doc.addImage(domImg, 'PNG', 0, 0, domCanvas.width, domCanvas.height, undefined, 'FAST');
      doc.save(fileName);
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

  logTicketPdfDebug('fallback renderTicketVisual acionado', {
    hasTicketElement: false,
    fileName,
  });

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
  doc.save(fileName);
}
