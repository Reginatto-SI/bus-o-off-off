import jsPDF from 'jspdf';
import { toCanvas as htmlToCanvas } from 'html-to-image';
import type { TicketCardData } from '@/components/public/TicketCard';
import { renderTicketVisual } from '@/lib/ticketVisualRenderer';

interface GenerateTicketPdfParams {
  ticket: TicketCardData;
  qrBase64: string;
  ticketElement?: HTMLElement | null;
}

export type TicketPdfDeliveryResult = 'downloaded' | 'shared' | 'preview';

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


function isIOSLikeDevice() {
  const userAgent = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';

  // iPadOS 13+ pode se identificar como Mac; touch points diferenciam iPad de desktop.
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

function getPdfBlob(doc: jsPDF) {
  return doc.output('blob');
}

function supportsAutomaticDownload() {
  return 'download' in HTMLAnchorElement.prototype;
}

async function sharePdfFile(file: File, title: string) {
  const shareData: ShareData = {
    files: [file],
    title,
    text: 'No iPhone, use Compartilhar para salvar em Arquivos ou enviar pelo WhatsApp.',
  };

  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return false;
  }

  if (typeof navigator.share !== 'function') return false;

  await navigator.share(shareData);
  return true;
}

function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function openPdfPreview(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const previewWindow = window.open(url, '_blank', 'noopener,noreferrer');

  if (!previewWindow) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function deliverTicketPdf(doc: jsPDF, fileName: string): Promise<TicketPdfDeliveryResult> {
  const blob = getPdfBlob(doc);
  const isiOS = isIOSLikeDevice();
  const canUseAutomaticDownload = supportsAutomaticDownload();

  if (isiOS) {
    const file = new File([blob], fileName, { type: 'application/pdf' });

    try {
      if (await sharePdfFile(file, 'Passagem SmartBus BR')) {
        logTicketPdfDebug('PDF entregue via Web Share API', { fileName });
        return 'shared';
      }
    } catch (error) {
      // Se o usuário cancelar o share sheet, não tratamos como falha técnica.
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
      console.warn('[ticket-pdf] Web Share API indisponível/falhou para PDF; abrindo preview.', error);
    }

    openPdfPreview(blob);
    logTicketPdfDebug('PDF aberto em preview no iOS/iPadOS', { fileName });
    return 'preview';
  }

  if (canUseAutomaticDownload) {
    downloadPdfBlob(blob, fileName);
    logTicketPdfDebug('PDF entregue por download tradicional', { fileName });
    return 'downloaded';
  }

  openPdfPreview(blob);
  logTicketPdfDebug('PDF aberto em preview por falta de suporte ao download automático', { fileName });
  return 'preview';
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForStableFrames(totalFrames = 3) {
  for (let frame = 0; frame < totalFrames; frame += 1) {
    await waitForNextFrame();
  }
}

async function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, warningMessage: string): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(`[ticket-pdf] ${warningMessage}`);
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isCanvasPainted(canvas: HTMLCanvasElement) {
  if (!canvas.width || !canvas.height) return false;

  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return true;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return true;
    }
    return false;
  } catch (error) {
    // Canvas com restrição de leitura não deve bloquear exportação; se há dimensões,
    // seguimos com warning controlado e deixamos a captura visual tentar renderizar.
    console.warn('[ticket-pdf] Não foi possível inspecionar pixels do canvas do QR Code.', error);
    return true;
  }
}

async function waitForCanvasPaint(canvas: HTMLCanvasElement) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (isCanvasPainted(canvas)) return;
    await waitForNextFrame();
  }

  console.warn('[ticket-pdf] QR Code em canvas não confirmou pintura antes da captura.');
}

async function waitForImageReady(image: HTMLImageElement, isImportant: boolean) {
  if (!image.complete) {
    await waitWithTimeout(
      new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      }),
      isImportant ? 8000 : 5000,
      isImportant ? 'Tempo limite aguardando logo/imagem importante da passagem.' : 'Tempo limite aguardando imagem da passagem.',
    );
  }

  if (typeof image.decode === 'function' && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    await waitWithTimeout(
      image.decode().catch((error) => {
        console.warn('[ticket-pdf] Falha ao decodificar imagem antes do PDF.', error);
      }),
      isImportant ? 8000 : 5000,
      isImportant ? 'Tempo limite decodificando logo/imagem importante da passagem.' : 'Tempo limite decodificando imagem da passagem.',
    );
  }

  if (isImportant && (image.naturalWidth <= 0 || image.naturalHeight <= 0)) {
    console.warn('[ticket-pdf] Logo/imagem importante sem dimensões naturais válidas antes do PDF.', {
      src: image.currentSrc || image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    });
  }
}

async function waitForTicketExportAssets(ticketElement: HTMLElement) {
  // Garante que fontes web, imagens reais, logos e QR Code estejam prontos antes da captura.
  // Sem esta preparação, o html-to-image pode rasterizar a passagem no meio do carregamento.
  if (document.fonts?.ready) {
    await waitWithTimeout(document.fonts.ready, 8000, 'Tempo limite aguardando fontes da passagem.');
  }

  const images = Array.from(ticketElement.querySelectorAll('img'));
  await Promise.all(
    images.map((image) => {
      const isImportant = image.dataset.ticketCompanyLogo === 'true' || image.closest('[data-smartbus-platform-card="true"]') !== null;
      return waitForImageReady(image, isImportant);
    }),
  );

  const canvases = Array.from(ticketElement.querySelectorAll('canvas'));
  await Promise.all(canvases.map((canvas) => waitForCanvasPaint(canvas)));

  await waitForStableFrames(3);

  const rect = ticketElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    console.warn('[ticket-pdf] Container da passagem com dimensões inválidas antes da captura.', {
      width: rect.width,
      height: rect.height,
      scrollWidth: ticketElement.scrollWidth,
      scrollHeight: ticketElement.scrollHeight,
    });
  }
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


function copyComputedBoxStyles(sourceElement: HTMLElement, targetElement: HTMLElement) {
  const computedStyle = window.getComputedStyle(sourceElement);
  targetElement.style.width = computedStyle.width;
  targetElement.style.height = computedStyle.height;
  targetElement.style.maxWidth = computedStyle.maxWidth;
  targetElement.style.maxHeight = computedStyle.maxHeight;
  targetElement.style.minWidth = computedStyle.minWidth;
  targetElement.style.minHeight = computedStyle.minHeight;
  targetElement.style.display = computedStyle.display === 'none' ? 'none' : 'block';
  targetElement.style.objectFit = 'contain';
  targetElement.style.objectPosition = 'center';
}

function replaceCanvasWithImagesForExport(sourceElement: HTMLElement, clonedElement: HTMLElement) {
  const sourceCanvases = Array.from(sourceElement.querySelectorAll('canvas'));
  const clonedCanvases = Array.from(clonedElement.querySelectorAll('canvas'));

  sourceCanvases.forEach((sourceCanvas, index) => {
    const clonedCanvas = clonedCanvases[index];
    if (!clonedCanvas || !sourceCanvas.width || !sourceCanvas.height) return;

    try {
      const canvasDataUrl = sourceCanvas.toDataURL('image/png');
      const image = document.createElement('img');
      image.src = canvasDataUrl;
      image.alt = sourceCanvas.getAttribute('aria-label') || 'QR Code da passagem';
      image.className = clonedCanvas.className;
      image.setAttribute('data-ticket-export-canvas-image', 'true');
      image.width = sourceCanvas.width;
      image.height = sourceCanvas.height;
      copyComputedBoxStyles(clonedCanvas, image);

      // No clone exportado, a imagem dataURL evita que o QR Code em canvas saia branco no iOS.
      clonedCanvas.replaceWith(image);
    } catch (error) {
      console.warn('[ticket-pdf] Não foi possível converter canvas da passagem para imagem.', error);
    }
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToDataUrl(imageUrl: string, cacheBust = false) {
  // No iOS, `cache: 'force-cache'` pode reusar uma resposta opaca/PWA sem CORS válidos,
  // fazendo o WebKit rasterizar o <foreignObject> com áreas brancas.
  // Quando cacheBust=true forçamos um fetch novo com resposta CORS "fresca".
  const url = cacheBust
    ? `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}_pdf=${Date.now()}`
    : imageUrl;
  const response = await fetch(url, {
    mode: 'cors',
    cache: cacheBust ? 'no-store' : 'force-cache',
  });
  if (!response.ok) throw new Error(`Falha ao buscar imagem para exportação: ${response.status}`);
  const blob = await response.blob();
  return blobToDataUrl(blob);
}


async function inlineImportantImagesForExport(sourceElement: HTMLElement, clonedElement: HTMLElement) {
  const sourceImages = Array.from(sourceElement.querySelectorAll('img'));
  const clonedImages = Array.from(clonedElement.querySelectorAll('img'));

  await Promise.all(
    sourceImages.map(async (sourceImage, index) => {
      const clonedImage = clonedImages[index];
      if (!clonedImage) return;

      const isImportant = sourceImage.dataset.ticketCompanyLogo === 'true' || sourceImage.closest('[data-smartbus-platform-card="true"]') !== null;
      if (!isImportant || sourceImage.naturalWidth <= 0 || sourceImage.naturalHeight <= 0) return;

      const imageUrl = sourceImage.currentSrc || sourceImage.src;
      if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) return;

      try {
        const dataUrl = await imageUrlToDataUrl(imageUrl);
        clonedImage.src = dataUrl;
        clonedImage.removeAttribute('srcset');
        clonedImage.style.objectFit = 'contain';
        clonedImage.style.objectPosition = 'center';
        await waitForImageReady(clonedImage, true);
      } catch (error) {
        // CORS pode impedir inlining em alguns CDNs; nesse caso preservamos a URL original
        // já carregada para não quebrar desktop/Android nem esconder a imagem no clone.
        console.warn('[ticket-pdf] Não foi possível embutir imagem importante no clone do PDF.', error);
      }
    }),
  );
}

async function prepareCloneVisualAssetsForExport(sourceElement: HTMLElement, clonedElement: HTMLElement) {
  // Atua somente no clone offscreen: QR em canvas vira <img> dataURL e logos importantes
  // são embutidas quando possível para evitar elementos brancos no PDF do iOS/Safari.
  replaceCanvasWithImagesForExport(sourceElement, clonedElement);
  await inlineImportantImagesForExport(sourceElement, clonedElement);
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
    await prepareCloneVisualAssetsForExport(ticketElement, exportElement);

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
      return await deliverTicketPdf(doc, fileName);
    } finally {
      exportHost.remove();
    }
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
  return await deliverTicketPdf(doc, fileName);
}
