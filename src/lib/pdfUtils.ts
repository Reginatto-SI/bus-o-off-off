import logo from '@/assets/logo.jpeg';

// Cor institucional laranja do sistema
export const BRAND_ORANGE = '#F97316';
export const BRAND_ORANGE_RGB = { r: 249, g: 115, b: 22 };

/**
 * Converte a logo do sistema para base64 para uso no PDF
 */
export async function getLogoBase64(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível criar contexto do canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/jpeg');
      resolve(dataURL);
    };
    img.onerror = () => {
      reject(new Error('Não foi possível carregar a logo'));
    };
    img.src = logo;
  });
}

/**
 * Formata data e hora no padrão brasileiro
 */
export function formatDateTime(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
