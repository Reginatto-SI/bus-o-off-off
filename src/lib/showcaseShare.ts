/**
 * Utilitários compartilhados para ações de divulgação da vitrine pública.
 *
 * Centraliza serialização/exportação do QR Code para evitar lógica duplicada entre
 * /admin/empresa e /empresa/:slug em modo edição.
 */
export type QrDownloadResult = 'ok' | 'missing_svg' | 'render_error' | 'export_error' | 'process_error';

const getShowcaseQrSvgString = (container: HTMLDivElement | null) => {
  const svgElement = container?.querySelector('svg');
  if (!svgElement) return null;
  return new XMLSerializer().serializeToString(svgElement);
};

export const downloadShowcaseQrSvg = (container: HTMLDivElement | null, fileBaseName: string): QrDownloadResult => {
  const svgString = getShowcaseQrSvgString(container);
  if (!svgString) return 'missing_svg';

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBaseName}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return 'ok';
};

export const downloadShowcaseQrPng = async (container: HTMLDivElement | null, fileBaseName: string): Promise<QrDownloadResult> => {
  const svgString = getShowcaseQrSvgString(container);
  if (!svgString) return 'missing_svg';

  return new Promise((resolve) => {
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new window.Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Comentário: escala 4x preserva nitidez para impressão e materiais de divulgação.
      const scale = 4;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve('render_error');
        return;
      }

      ctx.scale(scale, scale);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) {
          resolve('export_error');
          return;
        }

        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${fileBaseName}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        resolve('ok');
      }, 'image/png');

      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('process_error');
    };

    img.src = url;
  });
};
