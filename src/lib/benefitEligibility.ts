import { supabase } from '@/integrations/supabase/client';
import { BenefitProgram } from '@/types/database';

import { BENEFIT_PRICING_RULE_VERSION, resolveBestBenefitForPassengerPrice, type BenefitPriceResolution } from '../../supabase/functions/_shared/benefit-price';
export { BENEFIT_PRICING_RULE_VERSION, applyBenefitToPrice, resolveBestBenefitForPassengerPrice } from '../../supabase/functions/_shared/benefit-price';
export type { BenefitPriceResolution } from '../../supabase/functions/_shared/benefit-price';

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
