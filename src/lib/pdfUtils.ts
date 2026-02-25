import logo from '@/assets/logo.jpeg';
import { Company } from '@/types/database';

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

/**
 * Obtém a cor primária da empresa com fallback para cor padrão
 */
export function getCompanyPrimaryColor(company: Company | null): string {
  return company?.primary_color || BRAND_ORANGE;
}

/**
 * Obtém a cor do ticket da empresa com fallback para cor primária e depois padrão
 */
export function getCompanyTicketColor(company: Company | null): string {
  return company?.ticket_color || company?.primary_color || BRAND_ORANGE;
}

/**
 * Converte cor hex para RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : BRAND_ORANGE_RGB;
}

/**
 * Obtém o nome de exibição da empresa (trade_name > name > fallback)
 */
export function getCompanyDisplayName(company: Company | null): string {
  return company?.trade_name || company?.name || 'Empresa';
}

/**
 * Formata CNPJ para exibição (00.000.000/0001-00)
 */
export function formatCnpj(cnpj: string | null): string | null {
  if (!cnpj) return null;
  // Remove caracteres não numéricos
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj; // Retorna original se não tiver 14 dígitos
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
}

/**
 * Obtém a localização formatada (Cidade - UF)
 */
export function getCompanyLocation(company: Company | null): string | null {
  if (!company?.city && !company?.state) return null;
  if (company.city && company.state) return `${company.city} - ${company.state}`;
  return company.city || company.state || null;
}

/**
 * Carrega imagem de URL e converte para base64
 */
export async function loadImageAsBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
