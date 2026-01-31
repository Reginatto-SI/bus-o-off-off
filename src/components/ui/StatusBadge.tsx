import { cn } from '@/lib/utils';
import { EventStatus, SaleStatus, SellerStatus } from '@/types/database';

type StatusType = EventStatus | SaleStatus | SellerStatus;

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  rascunho: { label: 'Rascunho', className: 'status-badge-draft' },
  a_venda: { label: 'À Venda', className: 'status-badge-available' },
  encerrado: { label: 'Encerrado', className: 'status-badge-closed' },
  reservado: { label: 'Reservado', className: 'status-badge-reserved' },
  pago: { label: 'Pago', className: 'status-badge-paid' },
  ativo: { label: 'Ativo', className: 'status-badge-available' },
  inativo: { label: 'Inativo', className: 'status-badge-closed' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className={cn('status-badge', config.className, className)}>
      {config.label}
    </span>
  );
}
