import { supabase } from '@/integrations/supabase/client';
import { BenefitProgram } from '@/types/database';

export const BENEFIT_PRICING_RULE_VERSION = 'beneficio_checkout_v1';

// Log temporário de diagnóstico: habilite em runtime com localStorage.DEBUG_BENEFITS_CHECKOUT = '1'.
const shouldLogBenefitDebug = (): boolean => {
  if (typeof window === 'undefined') return false;
  return import.meta.env.DEV || window.localStorage.getItem('DEBUG_BENEFITS_CHECKOUT') === '1';
};

// Log temporário de diagnóstico: evita expor CPF completo em console.
const maskCpfForDebug = (cpf: string): string => {
  const digits = cpf.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return `***${digits}`;
  return `***${digits.slice(-4)}`;
};

export interface BenefitEligibilityInput {
  companyId: string;
  eventId: string;
  cpf: string;
  referenceDate?: Date;
}

export interface EligibleBenefitMatch {
  // A RPC pública retorna somente os campos necessários para cálculo/exibição.
  program: Pick<BenefitProgram, 'id' | 'name' | 'benefit_type' | 'benefit_value'>;
}

export interface BenefitEligibilityResult {
  normalizedCpf: string;
  eligibleMatches: EligibleBenefitMatch[];
}

interface BenefitEligibilityMatchRow {
  program_id: string;
  program_name: string;
  benefit_type: BenefitProgram['benefit_type'];
  benefit_value: number;
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
 * Regras consideradas pela RPC:
 * - Programa ativo e dentro da vigência
 * - CPF ativo e dentro da vigência
 * - Programa aplicável a todos os eventos OU explicitamente vinculado ao evento
 *
 * Esta função retorna os matches mínimos; `resolveBestBenefitForPassengerPrice`
 * aplica o desempate determinístico já usado nos checkouts público e administrativo.
 */
export async function getEligibleBenefitsByPassenger({
  companyId,
  eventId,
  cpf,
  referenceDate = new Date(),
}: BenefitEligibilityInput): Promise<BenefitEligibilityResult> {
  const normalizedCpf = normalizeCpfDigits(cpf);

  if (shouldLogBenefitDebug()) {
    // Log temporário de diagnóstico: confirma parâmetros efetivos enviados para elegibilidade.
    console.info('[benefits-debug] eligibility_rpc_call', {
      companyId,
      eventId,
      cpfMasked: maskCpfForDebug(normalizedCpf),
      rawCpfLength: cpf?.replace?.(/\D/g, '').length ?? 0,
      normalizedCpfLength: normalizedCpf.length,
      referenceDate: referenceDate.toISOString().slice(0, 10),
    });
  }

  if (normalizedCpf.length !== 11) {
    return { normalizedCpf, eligibleMatches: [] };
  }

  const refDate = referenceDate.toISOString().slice(0, 10);

  /**
   * Camada única de elegibilidade (público + admin):
   * - evita leitura direta das tabelas sensíveis pelo cliente anônimo;
   * - centraliza as regras de status/vigência/escopo por evento no banco.
   */
  const { data, error } = await supabase.rpc('get_benefit_eligibility_matches', {
    p_company_id: companyId,
    p_event_id: eventId,
    p_cpf: normalizedCpf,
    p_reference_date: refDate,
  });

  if (error) {
    if (shouldLogBenefitDebug()) {
      // Log temporário de diagnóstico: evidencia falha real da RPC antes do fallback no checkout.
      console.error('[benefits-debug] eligibility_rpc_error', {
        companyId,
        eventId,
        cpfMasked: maskCpfForDebug(normalizedCpf),
        referenceDate: refDate,
        errorCode: (error as { code?: string })?.code,
        errorMessage: error.message,
      });
    }
    throw new Error(`Falha ao consultar elegibilidade de benefício por CPF: ${error.message}`);
  }

  const rows = (data ?? []) as BenefitEligibilityMatchRow[];

  const eligibleMatches = rows.map((row) => ({
      program: {
        id: row.program_id,
        name: row.program_name,
        benefit_type: row.benefit_type,
        benefit_value: Number(row.benefit_value),
      },
    }));

  if (shouldLogBenefitDebug()) {
    // Log temporário de diagnóstico: mostra se houve match e quais programas foram retornados.
    console.info('[benefits-debug] eligibility_rpc_result', {
      companyId,
      eventId,
      cpfMasked: maskCpfForDebug(normalizedCpf),
      referenceDate: refDate,
      totalMatches: eligibleMatches.length,
      programs: eligibleMatches.map((match) => ({
        programId: match.program.id,
        name: match.program.name,
        benefitType: match.program.benefit_type,
        benefitValue: Number(match.program.benefit_value),
      })),
    });
  }

  return {
    normalizedCpf,
    eligibleMatches,
  };
}
