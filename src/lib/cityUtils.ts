// Helper para parsear "Cidade — UF" ou "Cidade - UF"
export function parseCityLabel(label: string | null | undefined): { city: string; state: string } {
  if (!label) return { city: '', state: '' };

  const separators = [' — ', ' - ', ' – '];
  for (const sep of separators) {
    if (label.includes(sep)) {
      const [city, state] = label.split(sep);
      return {
        city: city?.trim() || '',
        state: state?.trim().toUpperCase().slice(0, 2) || '',
      };
    }
  }

  const match = label.match(/^(.+?)\s*([A-Z]{2})$/i);
  if (match) {
    return { city: match[1].trim(), state: match[2].toUpperCase() };
  }

  return { city: label.trim(), state: '' };
}

// Helper para formatar cidade/estado como label
export function formatCityLabel(city: string | null | undefined, state: string | null | undefined): string {
  if (!city && !state) return '';
  if (!state) return city || '';
  if (!city) return state;
  return `${city} — ${state}`;
}

// Lista de UFs brasileiras
export const brazilianStates = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
];
