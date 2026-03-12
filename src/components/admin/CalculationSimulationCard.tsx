import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrencyBRL } from '@/lib/currency';
import type { EventFeeInput } from '@/lib/feeCalculator';

interface CalculationSimulationCardProps {
  basePrice: number;
  fees: EventFeeInput[];
  platformFeePercent?: number;
  passPlatformFeeToCustomer?: boolean;
}

/**
 * Card compartilhado de simulação financeira.
 * Mantém o mesmo layout/fórmula usados no admin de eventos e na venda manual.
 */
export function CalculationSimulationCard({
  basePrice,
  fees,
  platformFeePercent,
  passPlatformFeeToCustomer = false,
}: CalculationSimulationCardProps) {
  const activeFees = fees.filter((fee) => fee.is_active);
  const totalAdditionalFees = activeFees.reduce(
    (sum, fee) => sum + (fee.fee_type === 'percent' ? (basePrice * fee.value) / 100 : fee.value),
    0,
  );
  const totalAdditionalFeesRounded = Math.round(totalAdditionalFees * 100) / 100;
  const grossPerTicket = Math.round((basePrice + totalAdditionalFeesRounded) * 100) / 100;

  const hasValidCompanyPlatformFee =
    typeof platformFeePercent === 'number' && Number.isFinite(platformFeePercent) && platformFeePercent > 0;

  const platformFee = hasValidCompanyPlatformFee
    ? Math.round(grossPerTicket * (platformFeePercent / 100) * 100) / 100
    : 0;

  const customerTotal =
    passPlatformFeeToCustomer && hasValidCompanyPlatformFee
      ? grossPerTicket + platformFee
      : grossPerTicket;

  const organizerNet = passPlatformFeeToCustomer
    ? grossPerTicket
    : Math.round((grossPerTicket - platformFee) * 100) / 100;

  return (
    <Card className="p-3 bg-muted/50">
      <p className="text-xs text-muted-foreground mb-1">Simulação de cálculo</p>
      <div className="text-sm space-y-0.5">
        <div className="flex justify-between">
          <span>Passagem</span>
          <span>{formatCurrencyBRL(basePrice)}</span>
        </div>

        {activeFees.map((fee) => {
          const feeAmount = fee.fee_type === 'percent' ? (basePrice * fee.value) / 100 : fee.value;
          return (
            <div key={`${fee.name}-${fee.value}-${fee.fee_type}`} className="flex justify-between text-muted-foreground">
              <span>{fee.name}</span>
              <span>+ {formatCurrencyBRL(feeAmount)}</span>
            </div>
          );
        })}

        <div className="flex justify-between font-medium border-t pt-1 mt-1">
          <span>Total por passageiro</span>
          <span>{formatCurrencyBRL(customerTotal)}</span>
        </div>

        {hasValidCompanyPlatformFee && (
          <>
            <Separator className="my-1" />
            <div className="flex justify-between text-muted-foreground">
              <span>Comissão da plataforma ({platformFeePercent}%)</span>
              <span>{formatCurrencyBRL(platformFee)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Responsável</span>
              <span>{passPlatformFeeToCustomer ? 'Cliente' : 'Organizador'}</span>
            </div>
            <div className="flex justify-between font-medium text-primary">
              <span>Líquido estimado</span>
              <span>{formatCurrencyBRL(organizerNet)}</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
