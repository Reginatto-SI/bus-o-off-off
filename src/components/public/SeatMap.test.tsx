import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Seat } from '@/types/database';
import { SeatMap } from './SeatMap';

afterEach(cleanup);
const seat = (id: string, row_number: number, column_number: number, floor = 1, status: Seat['status'] = 'disponivel'): Seat => ({
  id, label: id, row_number, column_number, floor, status,
  vehicle_id: 'bus', company_id: 'company', category: 'convencional', created_at: '',
});
const seats = [seat('01', 1, 1), seat('03', 1, 3), seat('07', 3, 2), seat('08', 3, 3, 1, 'bloqueado'), seat('51', 1, 1, 2)];
const base = { seats, floors: 2, seatsLeftSide: 2, seatsRightSide: 1, maxSelection: 2, occupiedSeatIds: ['03'], blockedSeatIds: ['07'], onSelectionChange: vi.fn(), selectedSeats: [] };

describe('administrative seat map presentation', () => {
  it('preserves row gaps, empty columns, labels and occupied/blocked states', () => {
    const { container } = render(<SeatMap {...base} desktopHorizontal />);
    expect(container.querySelector('[data-row="3"]')).toHaveStyle({ gridColumn: '3' });
    expect(container.querySelector('[data-row="1"] .seat-map__empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assento 03 - ocupado' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Assento 07 - bloqueado' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Assento 08 - bloqueado' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Assento 03 - ocupado' })).toHaveTextContent('03');
  });

  it('uses the existing selection callback for selection, deselection and limits', () => {
    const change = vi.fn();
    const { rerender } = render(<SeatMap {...base} desktopHorizontal onSelectionChange={change} maxSelection={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assento 01 - disponível' }));
    expect(change).toHaveBeenLastCalledWith(['01']);
    rerender(<SeatMap {...base} desktopHorizontal onSelectionChange={change} maxSelection={1} selectedSeats={['51']} />);
    change.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Assento 01 - disponível' }));
    expect(change).not.toHaveBeenCalled();
    rerender(<SeatMap {...base} desktopHorizontal onSelectionChange={change} selectedSeats={['01']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assento 01 - selecionado' }));
    expect(change).toHaveBeenLastCalledWith([]);
  });

  it('keeps selections when changing floors and reports actual per-floor availability', () => {
    function Harness() {
      const [selectedSeats, onSelectionChange] = useState<string[]>([]);
      return <SeatMap {...base} desktopHorizontal selectedSeats={selectedSeats} onSelectionChange={onSelectionChange} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Assento 01 - disponível' }));
    const upper = screen.getByRole('tab', { name: /Piso superior.*1 vaga disponível/ });
    fireEvent.mouseDown(upper, { button: 0, ctrlKey: false });
    expect(screen.getByRole('button', { name: 'Assento 51 - disponível' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assento 01/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Assento 51 - disponível' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Piso inferior.*1 vaga disponível/ }), { button: 0, ctrlKey: false });
    expect(screen.getByRole('button', { name: 'Assento 01 - selecionado' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: '.text-primary.font-bold' })).toBeInTheDocument();
  });

  it('keeps the default public markup free of desktop-only numbers and navigation hints', () => {
    const { container } = render(<SeatMap {...base} floors={1} seats={seats.filter(s => s.floor === 1)} />);
    expect(container.querySelector('.seat-map--desktop-horizontal')).toBeNull();
    expect(container.querySelector('.seat-map__status-label')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('retains the loading interaction guard', () => {
    const change = vi.fn();
    render(<SeatMap {...base} desktopHorizontal interactionDisabled onSelectionChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assento 01 - disponível' }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByText('Sincronizando disponibilidade')).toBeInTheDocument();
  });
});
