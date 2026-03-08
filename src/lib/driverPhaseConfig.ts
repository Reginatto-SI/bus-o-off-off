/**
 * Shared configuration for driver operational phases.
 * Used by DriverHome, DriverBoarding, and DriverValidate.
 */
import type { OperationalPhase } from '@/lib/driverTripStorage';

export type PhaseConfig = {
  label: string;
  action: 'checkin' | 'checkout' | 'reboard';
  successTitle: string;
  /** KPI labels */
  doneLabel: string;
  pendingLabel: string;
  /** Status that counts as "done" for this phase */
  doneStatuses: string[];
  /** Status that counts as "pending" for this phase */
  pendingStatuses: string[];
  /** Badge labels */
  doneBadge: string;
  pendingBadge: string;
  /** Confirmation dialog */
  confirmTitle: string;
  confirmAction: string;
  /** Undo operation */
  undoAction: 'undo_checkin' | 'undo_checkout' | 'undo_reboard';
  undoTitle: string;
  undoConfirmText: string;
  undoSuccessTitle: string;
};

export const PHASE_CONFIG: Record<OperationalPhase, PhaseConfig> = {
  ida: {
    label: 'Ida',
    action: 'checkin',
    successTitle: 'EMBARQUE LIBERADO',
    doneLabel: 'Embarcados',
    pendingLabel: 'Pendentes da ida',
    doneStatuses: ['checked_in', 'checked_out', 'reboarded'],
    pendingStatuses: ['pendente'],
    doneBadge: 'Embarcado',
    pendingBadge: 'Pendente',
    confirmTitle: 'Confirmar embarque',
    confirmAction: 'Confirmar embarque',
    undoAction: 'undo_checkin',
    undoTitle: 'Desfazer embarque',
    undoConfirmText: 'Deseja desfazer o embarque de',
    undoSuccessTitle: 'EMBARQUE DESFEITO',
  },
  desembarque: {
    label: 'Desembarque',
    action: 'checkout',
    successTitle: 'DESEMBARQUE CONFIRMADO',
    doneLabel: 'Desembarcados',
    pendingLabel: 'No veículo',
    doneStatuses: ['checked_out', 'reboarded'],
    pendingStatuses: ['checked_in'],
    doneBadge: 'Desembarcou',
    pendingBadge: 'No veículo',
    confirmTitle: 'Confirmar desembarque',
    confirmAction: 'Confirmar desembarque',
    undoAction: 'undo_checkout',
    undoTitle: 'Desfazer desembarque',
    undoConfirmText: 'Deseja desfazer o desembarque de',
    undoSuccessTitle: 'DESEMBARQUE DESFEITO',
  },
  reembarque: {
    label: 'Reembarque',
    action: 'reboard',
    successTitle: 'REEMBARQUE LIBERADO',
    doneLabel: 'Reembarcados',
    pendingLabel: 'Faltando voltar',
    doneStatuses: ['reboarded'],
    pendingStatuses: ['checked_out'],
    doneBadge: 'Reembarcou',
    pendingBadge: 'Faltando',
    confirmTitle: 'Confirmar reembarque',
    confirmAction: 'Confirmar reembarque',
    undoAction: 'undo_reboard',
    undoTitle: 'Desfazer reembarque',
    undoConfirmText: 'Deseja desfazer o reembarque de',
    undoSuccessTitle: 'REEMBARQUE DESFEITO',
  },
};

/**
 * Returns applicable phases based on transport_policy.
 */
export function getApplicablePhases(transportPolicy: string): OperationalPhase[] {
  // "somente_ida" or policies that don't support return
  if (transportPolicy === 'somente_ida') {
    return ['ida'];
  }
  // All other policies support the full cycle
  return ['ida', 'desembarque', 'reembarque'];
}

/**
 * Reason code messages for the scanner overlay.
 */
export const REASON_MESSAGES: Record<string, string> = {
  ok: 'Operação realizada com sucesso',
  invalid_qr: 'QR inválido',
  already_checked_in: 'Já embarcado',
  sale_cancelled: 'Venda cancelada',
  sale_not_paid: 'Pagamento não confirmado',
  checkout_without_checkin: 'Desembarque sem embarque',
  already_checked_out: 'Desembarque já registrado',
  checkout_disabled: 'Desembarque desabilitado para este evento',
  not_allowed_company: 'Passagem de outra empresa',
  invalid_action: 'Ação inválida',
  already_reboarded: 'Já reembarcado',
  reboard_without_checkout: 'Reembarque sem desembarque',
  undo_not_applicable: 'Operação não pode ser desfeita nesta fase',
  rpc_error: 'Erro de comunicação',
  invalid_response: 'Resposta inválida',
};
