import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NewSaleWizardProgress, NewSaleWizardStageTitle, NewSaleWizardSummary, NewSaleWizardTransport } from './NewSaleWizardVisuals';
afterEach(cleanup);

describe('desktop wizard presentation', () => {
  it('shows the actual three steps and prevents jumping to current/future steps', () => {
    const back = vi.fn();
    render(<NewSaleWizardProgress step={2} mode="manual" onBack={back}/>);
    expect(screen.getByText('Etapa 2 de 3')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', {name:/Escolher poltronas/})).toBeDisabled();
    expect(screen.getByRole('button', {name:/Passageiros e recebimento/})).toBeDisabled();
    expect(screen.getByRole('button', {name:/Escolher poltronas/})).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', {name:/Evento e transporte/}));
    expect(back).toHaveBeenCalledExactlyOnceWith(1);
  });
  it.each([['manual','Passageiros e recebimento'], ['reserva','Passageiros e reserva'], ['bloqueio','Revisar bloqueio']] as const)('uses the existing %s modality without presenting a confirmed payment', (mode, title) => {
    render(<NewSaleWizardStageTitle step={3} mode={mode}/>);
    expect(screen.getByRole('heading', {name:title})).toBeInTheDocument();
    expect(screen.queryByText(/pagamento confirmado|venda concluída/i)).toBe(null);
  });
  it('passes a selected transport ID through the existing callback', () => {
    const change = vi.fn();
    render(<NewSaleWizardTransport hasEvent value="" onChange={change} choices={[{id:'trip-a',name:'Ônibus ABC1D23',journey:'Ida',capacity:20,remaining:12,departure:'06:30'}]}/>);
    fireEvent.click(screen.getByText('Ônibus ABC1D23'));
    expect(change).toHaveBeenCalledExactlyOnceWith('trip-a');
    expect(screen.getByText(/20 lugares/)).toHaveTextContent('20 lugares · 12 vagas restantes');
  });
  it('keeps keyboard-accessible radio selection and only the supplied choices', () => {
    render(<NewSaleWizardTransport hasEvent value="trip-a" onChange={vi.fn()} choices={[{id:'trip-a',name:'Van ABC1D23',journey:'Ida'}]}/>);
    expect(screen.getByRole('radio', {name:/Van ABC1D23/})).toHaveAttribute('aria-checked','true');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.queryByText(/vagas restantes/)).toBe(null);
  });
  it('does not invent selected facts when the operation has not started', () => {
    const {container} = render(<NewSaleWizardSummary seatLabels={[]}/>);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows one travel summary with the selected seats and no guessed amounts', () => {
    const edit = vi.fn();
    render(<NewSaleWizardSummary event="Evento de teste" date="12/12/2026" transport="Ônibus ABC1D23" boarding="Terminal" seatLabels={['01','02']} onEdit={edit}/>);
    expect(screen.getAllByRole('region', {name:'Resumo da operação'})).toHaveLength(1);
    expect(screen.getByText('2 poltronas selecionadas')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).toBe(null);
    fireEvent.click(screen.getByRole('button', {name:/Rever viagem/}));
    expect(edit).toHaveBeenCalledOnce();
  });
});
