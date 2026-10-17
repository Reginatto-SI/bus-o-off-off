import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, MapPin, Ticket } from 'lucide-react';

export function NewSaleMobileProgress({ step, mode }: { step: number; mode: string }) {
  const labels = ['Evento e transporte', 'Escolher poltronas', mode === 'bloqueio' ? 'Revisar bloqueio' : mode === 'reserva' ? 'Passageiros e reserva' : 'Passageiros e recebimento'];
  return <div className="new-sale-mobile-progress lg:hidden">
    <div><span>Etapa {step} de 3</span><strong>{labels[step - 1]}</strong></div>
    <div role="progressbar" aria-label={labels[step - 1]} aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
      {[1, 2, 3].map(number => <span key={number} data-complete={number <= step} />)}
    </div>
  </div>;
}

/** All inputs remain mounted. Existing validation messages force an invalid card open. */
export function NewSalePassengerCard({ mobile, index, count, seatLabel, hasError, filled, header, children }: {
  mobile: boolean; index: number; count: number; seatLabel: string; hasError: boolean; filled: boolean; header: ReactNode; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(index === 0 || count === 1);
  const id = useId();
  useEffect(() => { if (hasError) setExpanded(true); }, [hasError]);
  const open = expanded || hasError;
  const className = 'new-sale-passenger-card space-y-3 rounded-xl border bg-card p-4 shadow-sm';
  if (!mobile) return <div className={className}>{header}{children}</div>;
  return <div className={className} data-expanded={open}>
    <button type="button" className="new-sale-passenger-toggle" aria-expanded={open} aria-controls={id}
      aria-label={`Passageiro ${index + 1}, poltrona ${seatLabel}`} onClick={() => { if (!hasError) setExpanded(!open); }}>
      {header}<span className="new-sale-passenger-toggle__status" data-error={hasError}>{hasError ? 'Confira o CPF informado' : filled ? 'Nome e CPF preenchidos' : 'Preencher dados'}<ChevronDown size={16} aria-hidden="true"/></span>
    </button>
    <div id={id} hidden={!open} className="new-sale-passenger-fields-body space-y-3">{children}</div>
  </div>;
}

export function NewSaleMobileTravel({ event, date, transport, boarding, departure, seatLabels }: { event?: string; date?: string; transport?: string; boarding?: string; departure?: string | null; seatLabels: string[] }) {
  if (!event) return null;
  return <details className="new-sale-mobile-travel lg:hidden">
    <summary><Ticket size={17} aria-hidden="true"/><span><strong>{event}</strong><small>{seatLabels.length} poltrona{seatLabels.length === 1 ? '' : 's'} selecionada{seatLabels.length === 1 ? '' : 's'}</small></span><ChevronDown size={16} aria-hidden="true"/></summary>
    <div>{date && <p>{date}</p>}{transport && <p>{transport}</p>}{boarding && <p><MapPin size={14} aria-hidden="true"/>{boarding}{departure ? ` · ${departure}` : ''}</p>}{seatLabels.length > 0 && <p>Poltronas: {seatLabels.join(', ')}</p>}</div>
  </details>;
}
