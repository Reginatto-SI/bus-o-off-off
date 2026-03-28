import { supabase } from '@/integrations/supabase/client';
import { BenefitProgram, BenefitProgramEligibleCpf } from '@/types/database';

export const BENEFIT_PRICING_RULE_VERSION = 'beneficio_checkout_v1';

export interface BenefitEligibilityInput {
  companyId: string;
  eventId: string;
  cpf: string;
  referenceDate?: Date;
}

export interface EligibleBenefitMatch {
  program: BenefitProgram;
  cpfRecord: BenefitProgramEligibleCpf;
}

export interface BenefitEligibilityResult {
  normalizedCpf: string;
  eligibleMatches: EligibleBenefitMatch[];
}

export interface BenefitPriceResolution {
  benefitApplied: boolean;
  benefitProgramId: string | null;
  benefitProgramName: string | null;
  benefitType: BenefitProgram['benefit_type'] | null;
  benefitValue: number | null;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  pricingRuleVersion: string;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Aplica o benefício em um preço base usando a regra oficial da fase 1.
 * Ordem obrigatória: preço bruto -> benefício -> preço final.
 */
export function applyBenefitToPrice(
  originalPrice: number,
  benefitType: BenefitProgram['benefit_type'],
  benefitValue: number,
): { discountAmount: number; finalPrice: number } {
  const base = roundCurrency(Math.max(0, Number(originalPrice) || 0));
  const normalizedBenefitValue = Math.max(0, Number(benefitValue) || 0);

  let finalPrice = base;

  if (benefitType === 'percentual') {
    const percentDiscount = roundCurrency(base * (normalizedBenefitValue / 100));
    finalPrice = roundCurrency(base - percentDiscount);
  } else if (benefitType === 'valor_fixo') {
    finalPrice = roundCurrency(base - normalizedBenefitValue);
  } else {
    finalPrice = roundCurrency(normalizedBenefitValue);
  }

  finalPrice = Math.max(0, finalPrice);
  const discountAmount = roundCurrency(base - finalPrice);

  return {
    discountAmount,
    finalPrice,
  };
}

/**
 * Resolve de forma determinística o benefício vencedor (mais vantajoso) para UM passageiro.
 */
export function resolveBestBenefitForPassengerPrice(
  originalPrice: number,
  matches: EligibleBenefitMatch[],
): BenefitPriceResolution {
  const safeOriginal = roundCurrency(Math.max(0, Number(originalPrice) || 0));

  if (!matches.length) {
    return {
      benefitApplied: false,
      benefitProgramId: null,
      benefitProgramName: null,
      benefitType: null,
      benefitValue: null,
      originalPrice: safeOriginal,
      discountAmount: 0,
      finalPrice: safeOriginal,
      pricingRuleVersion: BENEFIT_PRICING_RULE_VERSION,
    };
  }

  const scored = matches.map((match) => {
    const price = applyBenefitToPrice(
      safeOriginal,
      match.program.benefit_type,
      Number(match.program.benefit_value),
    );
    return {
      match,
      ...price,
    };
  });

  scored.sort((a, b) => {
    // 1) menor preço final = mais vantajoso para o passageiro
    if (a.finalPrice !== b.finalPrice) return a.finalPrice - b.finalPrice;
    // 2) maior desconto absoluto
    if (a.discountAmount !== b.discountAmount) return b.discountAmount - a.discountAmount;
    // 3) desempate estável por id do programa
    return a.match.program.id.localeCompare(b.match.program.id);
  });

  const winner = scored[0];

  return {
    benefitApplied: true,
    benefitProgramId: winner.match.program.id,
    benefitProgramName: winner.match.program.name,
    benefitType: winner.match.program.benefit_type,
    benefitValue: Number(winner.match.program.benefit_value),
    originalPrice: safeOriginal,
    discountAmount: roundCurrency(winner.discountAmount),
    finalPrice: roundCurrency(winner.finalPrice),
    pricingRuleVersion: BENEFIT_PRICING_RULE_VERSION,
  };
}

export async function resolvePassengerBenefitPrice(params: {
  companyId: string;
  eventId: string;
  cpf: string;
  originalPrice: number;
  referenceDate?: Date;
}): Promise<BenefitPriceResolution> {
  const eligibility = await getEligibleBenefitsByPassenger({
    companyId: params.companyId,
    eventId: params.eventId,
    cpf: params.cpf,
    referenceDate: params.referenceDate,
  });

  return resolveBestBenefitForPassengerPrice(
    params.originalPrice,
    eligibility.eligibleMatches,
  );
}

/**
 * Normaliza CPF para dígitos puros (11 posições) para manter armazenamento/consulta consistentes.
 */
export function normalizeCpfDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

/**
 * Validação determinística de CPF para uso administrativo e no checkout futuro.
 * Mantida localmente para evitar heurísticas implícitas e facilitar auditoria.
 */
export function isValidCpfDigits(value: string): boolean {
  const cpf = normalizeCpfDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base: string, factor: number) => {
    let total = 0;
    for (const char of base) {
      total += Number(char) * factor;
      factor -= 1;
    }
    const rest = (total * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const digit1 = calcDigit(cpf.slice(0, 9), 10);
  const digit2 = calcDigit(cpf.slice(0, 10), 11);
  return digit1 === Number(cpf[9]) && digit2 === Number(cpf[10]);
}

/**
 * Consulta os benefícios elegíveis para UM passageiro (CPF) em um evento/empresa.
 *
 * Regras consideradas (sem decidir automaticamente entre múltiplos programas):
 * - Programa ativo e dentro da vigência
 * - CPF ativo e dentro da vigência
 * - Programa aplicável a todos os eventos OU explicitamente vinculado ao evento
 *
 * Observação importante para integração futura do checkout:
 * esta função retorna todos os matches elegíveis e NÃO escolhe um único programa.
 * A prioridade/desempate ficará para uma decisão de negócio posterior,
 * garantindo transparência e auditabilidade da regra final.
 */
export async function getEligibleBenefitsByPassenger({
  companyId,
  eventId,
  cpf,
  referenceDate = new Date(),
}: BenefitEligibilityInput): Promise<BenefitEligibilityResult> {
  const normalizedCpf = normalizeCpfDigits(cpf);

  if (normalizedCpf.length !== 11) {
    return { normalizedCpf, eligibleMatches: [] };
  }

  const refDate = referenceDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('benefit_program_eligible_cpf')
    .select(`
      *,
      program:benefit_programs!benefit_program_eligible_cpf_benefit_program_id_fkey!inner(*),
      event_links:benefit_program_event_links(event_id)
    `)
    .eq('company_id', companyId)
    .eq('cpf', normalizedCpf)
    .eq('status', 'ativo')
    .eq('program.company_id', companyId)
    .eq('program.status', 'ativo')
    .or(`valid_from.is.null,valid_from.lte.${refDate}`)
    .or(`valid_until.is.null,valid_until.gte.${refDate}`)
    .or(`program.valid_from.is.null,program.valid_from.lte.${refDate}`)
    .or(`program.valid_until.is.null,program.valid_until.gte.${refDate}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Falha ao consultar elegibilidade de benefício por CPF: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as Array<BenefitProgramEligibleCpf & {
    program: BenefitProgram;
    event_links: Array<{ event_id: string }> | null;
  }>;

  const eligibleMatches = rows
    .filter((row) => {
      if (row.program.applies_to_all_events) return true;
      return (row.event_links ?? []).some((link) => link.event_id === eventId);
    })
    .map((row) => ({
      cpfRecord: {
        id: row.id,
        company_id: row.company_id,
        benefit_program_id: row.benefit_program_id,
        cpf: row.cpf,
        full_name: row.full_name,
        status: row.status,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      program: row.program,
    }));

  return {
    normalizedCpf,
    eligibleMatches,
  };
}
