import { Check, Bus, CalendarDays, Clock3, MapPin, Ticket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Mode = 'manual' | 'reserva' | 'bloqueio';
const copy = {
  manual: { title: 'Vamos preparar sua venda', last: 'Passageiros e recebimento', description: 'Confira os passageiros e o recebimento presencial antes de registrar.' },
  reserva: { title: 'Prepare uma nova reserva', last: 'Passageiros e reserva', description: 'Confira os passageiros e a validade antes de reservar.' },
  bloqueio: { title: 'Organize o bloqueio de poltronas', last: 'Revisar bloqueio', description: 'Informe o motivo e revise as poltronas antes de bloquear.' },
};

/** Presentation only: progression and validation remain owned by NewSaleModal. */
export function NewSaleWizardProgress({ step, mode, onBack }: {step: number; mode: Mode; onBack: (step: number) => void}) {
  const labels = ['Evento e transporte', 'Escolher poltronas', copy[mode].last];
  return <div className="new-sale-progress hidden lg:block">
    <div className="new-sale-progress__caption"><span>Etapa {step} de {labels.length}</span><span>{step === 1 ? 'Comece pela viagem' : step === 2 ? 'Selecione os lugares' : 'Última revisão'}</span></div>
    <nav aria-label="Etapas da operação"><ol className="new-sale-progress__steps">
      {labels.map((label, i) => {
        const number = i + 1;
        return <li key={label} data-state={number === step ? 'current' : number < step ? 'complete' : 'upcoming'}>
          <button type="button" disabled={number >= step} onClick={() => onBack(number)} aria-current={number === step ? 'step' : undefined}>
            <span className="new-sale-progress__number">{number < step ? <Check size={15} aria-hidden="true"/> : number}</span>
            <span>{label}</span>
          </button>
          {i < labels.length - 1 && <span className="new-sale-progress__line" aria-hidden="true"/>}
        </li>;
      })}
    </ol></nav>
  </div>;
}

export function NewSaleWizardStageTitle({step, mode}: {step: number; mode: Mode}) {
  const title = step === 1 ? copy[mode].title : step === 2 ? 'Escolha os lugares da viagem' : copy[mode].last;
  const description = step === 1 ? 'Escolha o evento, o transporte e o ponto de embarque.' : step === 2 ? 'Use o mapa para selecionar as poltronas disponíveis.' : copy[mode].description;
  return <div className="new-sale-stage-title hidden lg:block"><h3>{title}</h3><p>{description}</p></div>;
}

type TransportChoice = { id: string; name: string; journey: string; departure?: string | null; capacity?: number; remaining?: number };
export function NewSaleWizardTransport({choices, value, onChange, hasEvent}: {choices: TransportChoice[]; value: string; onChange: (value: string) => void; hasEvent: boolean}) {
  if (!choices.length) return <p className="new-sale-transport-empty hidden lg:block">{hasEvent ? 'Nenhum transporte disponível para este evento.' : 'Selecione o evento para consultar os transportes disponíveis.'}</p>;
  return <RadioGroup className="new-sale-transports hidden lg:grid" value={value} onValueChange={onChange} aria-label="Transporte">
    {choices.map(choice => <div key={choice.id} className={cn('new-sale-transport', choice.id === value && 'is-selected')}>
      <RadioGroupItem id={`wizard-transport-${choice.id}`} value={choice.id} className="new-sale-transport__radio"/>
      <Label htmlFor={`wizard-transport-${choice.id}`}>
        <span className="new-sale-transport__icon"><Bus size={22} aria-hidden="true"/></span>
        <span className="new-sale-transport__body"><strong>{choice.name}</strong><span>{choice.journey}{choice.departure && <> · <Clock3 size={12} aria-hidden="true"/> {choice.departure}</>}</span>
        {choice.capacity !== undefined && <span>{choice.capacity} lugares{choice.remaining !== undefined && <> · {choice.remaining} vagas restantes</>}</span>}</span>
      </Label>
    </div>)}
  </RadioGroup>;
}

/** Accepts formatted, already selected facts; never calculates price or availability. */
export function NewSaleWizardSummary({event, date, transport, boarding, departure, seatLabels, onEdit, amount}: {
  event?: string; date?: string; transport?: string; boarding?: string; departure?: string | null; seatLabels: string[]; onEdit?: () => void; amount?: string;
}) {
  if (!event) return null;
  return <section className="new-sale-summary hidden lg:block" aria-label="Resumo da operação">
    <div className="new-sale-summary__heading"><span><Ticket size={16} aria-hidden="true"/> Sua viagem</span>{onEdit && <Button type="button" variant="ghost" size="sm" onClick={onEdit}>Rever viagem <ArrowRight size={13} aria-hidden="true"/></Button>}</div>
    <div className="new-sale-summary__facts"><div><strong>{event}</strong>{date && <span><CalendarDays size={13} aria-hidden="true"/>{date}</span>}</div>{transport && <div><span className="new-sale-summary__label">Transporte</span><strong>{transport}</strong></div>}{boarding && <div><span className="new-sale-summary__label">Embarque{departure ? ` · ${departure}` : ''}</span><strong><MapPin size={13} aria-hidden="true"/>{boarding}</strong></div>}</div>
    <div className="new-sale-summary__quantity"><span>Passagens selecionadas</span><strong>{seatLabels.length}</strong>{amount && <><span>Subtotal calculado</span><strong>{amount}</strong></>}</div>
    {seatLabels.length > 0 && <div className="new-sale-summary__seats"><span>{seatLabels.length} {seatLabels.length === 1 ? 'poltrona selecionada' : 'poltronas selecionadas'}</span><div>{seatLabels.map((label, i) => <span key={`${label}-${i}`}>{label}</span>)}</div></div>}
  </section>;
}
