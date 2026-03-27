import { supabase } from '@/integrations/supabase/client';
import { BenefitProgram, BenefitProgramEligibleCpf } from '@/types/database';

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
      program:benefit_programs!inner(*),
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

  const rows = (data ?? []) as Array<BenefitProgramEligibleCpf & {
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
