import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { NewSaleMobileProgress, NewSaleMobileTravel, NewSalePassengerCard } from './NewSaleMobile';
import { MobileSalesFilters } from './MobileSalesFilters';
import { useMobileSaleViewport } from './useMobileSaleViewport';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('mobile sales presentation', () => {
  it.each([['manual', 'Passageiros e recebimento'], ['reserva', 'Passageiros e reserva'], ['bloqueio', 'Revisar bloqueio']])('announces the complete last step in %s mode', (mode, name) => {
    render(<NewSaleMobileProgress step={3} mode={mode}/>);
    expect(screen.getByText('Etapa 3 de 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', {name})).toHaveAttribute('aria-valuenow', '3');
  });
  it('retains the mounted passenger input and its value across collapse and expansion', () => {
    function Card() {
      const [name, setName] = useState('');
      return <NewSalePassengerCard mobile index={0} count={2} seatLabel="58" filled={false} hasError={false} header={<span>Passageiro 1</span>}><input aria-label="Nome" value={name} onChange={e => setName(e.target.value)}/></NewSalePassengerCard>;
    }
    render(<Card/>);
    const field = screen.getByRole('textbox', {name:'Nome'});
    fireEvent.change(field, {target:{value:'Maria'}});
    const toggle = screen.getByRole('button', {name:'Passageiro 1, poltrona 58'});
    fireEvent.click(toggle);
    expect(field).toBeInTheDocument();
    expect(field).not.toBeVisible();
    fireEvent.click(toggle);
    expect(field).toBeVisible();
    expect(field).toHaveValue('Maria');
  });
  it('keeps an invalid CPF message visible even when the passenger is collapsed', () => {
    const {rerender} = render(<NewSalePassengerCard mobile index={1} count={2} seatLabel="59" filled={false} hasError header={<span>Passageiro 2</span>}><p>CPF inválido</p></NewSalePassengerCard>);
    const toggle = screen.getByRole('button', {name:'Passageiro 2, poltrona 59'});
    fireEvent.click(toggle);
    expect(screen.getByText('CPF inválido')).toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded','true');
    rerender(<NewSalePassengerCard mobile index={1} count={2} seatLabel="59" filled hasError={false} header={<span>Passageiro 2</span>}><p>CPF válido</p></NewSalePassengerCard>);
    expect(screen.getByText('CPF válido')).toBeVisible();
  });
  it('does not introduce disclosure controls in the approved desktop card', () => {
    const {container} = render(<NewSalePassengerCard mobile={false} index={1} count={2} seatLabel="59" filled={false} hasError={false} header={<div>Passageiro 2</div>}><input aria-label="Nome"/></NewSalePassengerCard>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.new-sale-passenger-fields-body')).toBeNull();
    expect(screen.getByRole('textbox')).toBeVisible();
  });
  it('shows only supplied travel facts and no invented monetary values', () => {
    render(<NewSaleMobileTravel event="Festival" boarding="Terminal" departure="09:00" seatLabels={['58','59']}/>);
    fireEvent.click(screen.getByText('Festival'));
    expect(screen.getByText('2 poltronas selecionadas')).toBeInTheDocument();
    expect(screen.getByText('Poltronas: 58, 59')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).toBeNull();
  });
  it('keeps quick search available with secondary filters collapsed and passes through input', () => {
    const change = vi.fn();
    render(<MobileSalesFilters search="Maria" onSearchChange={change} active={false}><input aria-label="Vendedor" defaultValue="Ana"/></MobileSalesFilters>);
    expect(screen.getByRole('searchbox', {name:'Consultar vendas'})).toHaveValue('Maria');
    expect(screen.getByLabelText('Vendedor')).not.toBeVisible();
    fireEvent.change(screen.getByRole('searchbox'), {target:{value:'João'}});
    expect(change).toHaveBeenCalledWith('João');
  });
  it('opens applied secondary filters and preserves their controls', () => {
    render(<MobileSalesFilters search="" onSearchChange={vi.fn()} active><input aria-label="Vendedor" defaultValue="Ana"/></MobileSalesFilters>);
    expect(screen.getByLabelText('Vendedor')).toBeVisible();
    expect(screen.getByText('Filtros · aplicados')).toBeInTheDocument();
  });
  it('observes a dialog mounted after the parent effect and keeps focused inputs in view on keyboard resize', () => {
    const viewport = Object.assign(new EventTarget(), {height:800, offsetTop:0});
    vi.stubGlobal('visualViewport', viewport);
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    function Harness() {
      const [mounted, setMounted] = useState(false);
      const [element, setElement] = useState<HTMLDivElement | null>(null);
      useMobileSaleViewport(element, true);
      return <><button onClick={() => setMounted(true)}>Abrir</button>{mounted && <div ref={setElement} data-testid="dialog"><div className="new-sale-wizard__scroll"><div data-radix-scroll-area-viewport data-testid="viewport" ref={node => { if (node) node.getBoundingClientRect = () => ({top:100, bottom:300}) as DOMRect; }}><input aria-label="Passageiro" ref={node => { if (node) node.getBoundingClientRect = () => ({top:350 - (node.parentElement?.scrollTop ?? 0), bottom:394 - (node.parentElement?.scrollTop ?? 0)}) as DOMRect; }}/></div></div></div>}</>;
    }
    render(<Harness/>);
    fireEvent.click(screen.getByRole('button', {name:'Abrir'}));
    expect(screen.getByTestId('dialog').style.getPropertyValue('--mobile-sale-height')).toBe('800px');
    screen.getByRole('textbox').focus();
    viewport.height = 420;
    viewport.dispatchEvent(new Event('resize'));
    expect(screen.getByTestId('dialog').style.getPropertyValue('--mobile-sale-height')).toBe('420px');
    expect(screen.getByTestId('viewport').scrollTop).toBe(106);
    vi.stubGlobal('innerWidth', 1440);
    viewport.dispatchEvent(new Event('resize'));
    expect(screen.getByTestId('dialog').style.getPropertyValue('--mobile-sale-height')).toBe('');
  });
});
