import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrencyBRL } from '@/lib/currency';
import type { EventFeeInput } from '@/lib/feeCalculator';

interface CalculationSimulationCardProps {
  basePrice: number;
  fees: EventFeeInput[];
  quantity?: number;
  showSaleTotals?: boolean;
  platformFeePercent?: number;
  passPlatformFeeToCustomer?: boolean;
  platformFeeAmountOverride?: number;
  platformFeeLabelOverride?: string;
}

/**
 * Card compartilhado de simulação financeira.
 * Mantém o mesmo layout/fórmula usados no admin de eventos e na venda manual.
 */
export function CalculationSimulationCard({
  basePrice,
  fees,
  quantity = 1,
  showSaleTotals = false,
  platformFeePercent,
  passPlatformFeeToCustomer = false,
  platformFeeAmountOverride,
  platformFeeLabelOverride,
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
  const hasPlatformFeeOverride =
    typeof platformFeeAmountOverride === 'number' && Number.isFinite(platformFeeAmountOverride) && platformFeeAmountOverride >= 0;

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


  // No fluxo manual podemos forçar visão consolidada para exibir tudo em um único card.
  const isAggregatedSaleView = showSaleTotals;
  const subtotal = Math.round(basePrice * quantity * 100) / 100;
  const totalFees = Math.round(totalAdditionalFeesRounded * quantity * 100) / 100;
  const totalSale = Math.round(customerTotal * quantity * 100) / 100;
  const totalPlatformFee = Math.round(platformFee * quantity * 100) / 100;
  const totalOrganizerNet = Math.round(organizerNet * quantity * 100) / 100;
  // Override opcional para cenários em que o valor oficial da taxa vem de motor externo
  // (ex.: taxa progressiva por passageiro), evitando divergência visual no resumo.
  const resolvedPlatformFee = hasPlatformFeeOverride
    ? Math.round((platformFeeAmountOverride ?? 0) * 100) / 100
    : (isAggregatedSaleView ? totalPlatformFee : platformFee);
  const shouldRenderPlatformSection = hasPlatformFeeOverride || hasValidCompanyPlatformFee;

  return (
    <Card className="p-3 bg-muted/50">
      <p className="text-xs text-muted-foreground mb-1">Simulação de cálculo</p>
      <div className="text-sm space-y-0.5">
        {isAggregatedSaleView ? (
          <>
            <div className="flex justify-between">
              <span>Preço por passagem</span>
              <span>{formatCurrencyBRL(basePrice)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Quantidade</span>
              <span>{quantity}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span>Subtotal</span>
              <span>{formatCurrencyBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa de serviço</span>
              <span>+ {formatCurrencyBRL(totalFees)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1 mt-1">
              <span>Total da venda</span>
              <span>{formatCurrencyBRL(totalSale)}</span>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}

        {shouldRenderPlatformSection && (
          <>
            <Separator className="my-1" />
            <div className="flex justify-between text-muted-foreground">
              <span>{platformFeeLabelOverride ?? `Comissão da plataforma (${platformFeePercent}%)`}</span>
              <span>{formatCurrencyBRL(resolvedPlatformFee)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Responsável</span>
              <span>{passPlatformFeeToCustomer ? 'Cliente' : 'Organizador'}</span>
            </div>
            <div className="flex justify-between font-medium text-primary">
              <span>Líquido estimado</span>
              <span>{formatCurrencyBRL(isAggregatedSaleView ? totalOrganizerNet : organizerNet)}</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
