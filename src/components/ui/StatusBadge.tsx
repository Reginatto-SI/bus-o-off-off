import { cn } from '@/lib/utils';
import { DriverStatus, EventStatus, SaleStatus, SellerStatus, VehicleStatus } from '@/types/database';

// "processando" é um status visual-only usado no frontend quando a venda está
// "reservado" no banco mas existe uma cobrança online oficial em andamento.
type StatusType =
  | EventStatus
  | SaleStatus
  | SellerStatus
  | VehicleStatus
  | DriverStatus
  | 'processando'
  | 'pendente'
  | 'pendente_taxa'
  | 'pendente_pagamento'
  | 'bloqueado';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  rascunho: { label: 'Rascunho', className: 'status-badge-draft' },
  a_venda: { label: 'À Venda', className: 'status-badge-available' },
  encerrado: { label: 'Encerrado', className: 'status-badge-closed' },
  pendente: { label: 'Pendente', className: 'status-badge-reserved' },
  pendente_taxa: { label: 'Pendente de Taxa', className: 'status-badge-reserved' },
  pendente_pagamento: { label: 'Aguardando Pagamento', className: 'status-badge-reserved' },
  reservado: { label: 'Reservado', className: 'status-badge-reserved' },
  processando: { label: 'Processando', className: 'status-badge-reserved' },
  pago: { label: 'Pago', className: 'status-badge-paid' },
  cancelado: { label: 'Cancelado', className: 'status-badge-cancelled' },
  bloqueado: { label: 'Bloqueado', className: 'status-badge-blocked' },
  ativo: { label: 'Ativo', className: 'status-badge-available' },
  inativo: { label: 'Inativo', className: 'status-badge-closed' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig['reservado'];

  return (
    <span className={cn('status-badge', config.className, className)}>
      {config.label}
    </span>
  );
}
