// Lista centralizada de slugs reservados para não conflitar com rotas públicas críticas.
export const RESERVED_PUBLIC_SLUGS = new Set([
  'eventos',
  'login',
  'admin',
  'empresa',
  'confirmacao',
  'consultar-passagens',
  'cadastro-empresa',
  'v',
  'vendedor',
]);

export const normalizePublicSlug = (value: string) => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized;
};

export const isReservedPublicSlug = (slug: string) => RESERVED_PUBLIC_SLUGS.has(slug.toLowerCase());
