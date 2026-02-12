import { useState } from 'react';
import { Seat } from '@/types/database';
import { SeatButton, SeatState } from './SeatButton';
import { SeatLegend } from './SeatLegend';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface SeatMapProps {
  seats: Seat[];
  occupiedSeatIds: string[];
  maxSelection: number;
  selectedSeats: string[];
  onSelectionChange: (seatIds: string[]) => void;
  floors: number;
  seatsLeftSide: number;
  seatsRightSide: number;
}

export function SeatMap({
  seats,
  occupiedSeatIds,
  maxSelection,
  selectedSeats,
  onSelectionChange,
  floors,
  seatsLeftSide,
  seatsRightSide,
}: SeatMapProps) {
  const [activeFloor, setActiveFloor] = useState(1);

  const floorSeats = seats
    .filter((s) => s.floor === activeFloor)
    .sort((a, b) => {
      if (a.row_number !== b.row_number) return a.row_number - b.row_number;
      return a.column_number - b.column_number;
    });

  const maxCol = Math.max(...floorSeats.map((s) => s.column_number), 0);
  const totalCols = maxCol;

  // Group seats by row
  const rows = new Map<number, Seat[]>();
  floorSeats.forEach((s) => {
    const existing = rows.get(s.row_number) || [];
    existing.push(s);
    rows.set(s.row_number, existing);
  });

  const getSeatState = (seat: Seat): SeatState => {
    if (seat.status === 'bloqueado') return 'blocked';
    if (occupiedSeatIds.includes(seat.id)) return 'occupied';
    if (selectedSeats.includes(seat.id)) return 'selected';
    return 'available';
  };

  const handleSeatClick = (seatId: string) => {
    if (selectedSeats.includes(seatId)) {
      onSelectionChange(selectedSeats.filter((id) => id !== seatId));
    } else {
      if (selectedSeats.length >= maxSelection) {
        toast.info(`Você já selecionou o máximo de ${maxSelection} assento${maxSelection > 1 ? 's' : ''}.`);
        return;
      }
      onSelectionChange([...selectedSeats, seatId]);
    }
  };

  // Build row rendering: left seats | corridor | right seats
  // Comentário: corredor central respeita configuração do veículo (2x2, 2x1, 3x1 etc.).
  const corridorAfterCol = Math.max(1, seatsLeftSide);
  const rightSideColumnCount = Math.max(1, seatsRightSide);

  return (
    <div className="space-y-4">
      {/* Floor selector */}
      {floors > 1 && (
        <Tabs value={String(activeFloor)} onValueChange={(v) => setActiveFloor(Number(v))}>
          <TabsList className="w-full">
            <TabsTrigger value="1" className="flex-1">Piso inferior</TabsTrigger>
            <TabsTrigger value="2" className="flex-1">Piso superior</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Selection counter */}
      <div className="text-center text-sm font-medium text-foreground">
        Selecionados: <span className="text-primary font-bold">{selectedSeats.length}</span> de {maxSelection}
      </div>

      {/* Vehicle body */}
      <div className="relative max-w-[320px] mx-auto">
        {/* Windshield shape */}
        <div className="bg-muted/30 border-2 border-border rounded-t-[2.5rem] rounded-b-2xl overflow-hidden">
          {/* Driver row */}
          <div className="flex items-center px-4 py-3 border-b border-border/50 bg-muted/40">
            <div className="flex items-center gap-2 text-muted-foreground">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="3" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="21" />
                <line x1="3" y1="12" x2="6" y2="12" />
              </svg>
              <span className="text-xs font-medium">Motorista</span>
            </div>
          </div>

          {/* Seat grid */}
          <div className="px-3 py-3 space-y-1.5">
            {Array.from(rows.entries()).map(([rowNum, rowSeats]) => {
              const leftSeats = rowSeats.filter(s => s.column_number <= corridorAfterCol);
              const rightSeats = rowSeats.filter(s => s.column_number > corridorAfterCol);

              return (
                <div key={rowNum} className="flex items-center justify-center gap-1">
                  {/* Left side */}
                  <div className="flex gap-1" style={{ minWidth: `${corridorAfterCol * 48}px` }}>
                    {Array.from({ length: corridorAfterCol }, (_, i) => {
                      const colNum = i + 1;
                      const seat = leftSeats.find(s => s.column_number === colNum);
                      if (seat) {
                        return (
                          <SeatButton
                            key={seat.id}
                            label={seat.label}
                            state={getSeatState(seat)}
                            onClick={() => handleSeatClick(seat.id)}
                          />
                        );
                      }
                      return <div key={`empty-l-${rowNum}-${colNum}`} className="w-11 h-11" />;
                    })}
                  </div>

                  {/* Corridor */}
                  <div className="w-6 flex items-center justify-center">
                    <div className="w-px h-8 bg-border/30" />
                  </div>

                  {/* Right side */}
                  <div className="flex gap-1" style={{ minWidth: `${Math.max(Math.max(totalCols - corridorAfterCol, rightSideColumnCount), 1) * 48}px` }}>
                    {Array.from({ length: Math.max(Math.max(totalCols - corridorAfterCol, rightSideColumnCount), 1) }, (_, i) => {
                      const colNum = corridorAfterCol + 1 + i;
                      const seat = rightSeats.find(s => s.column_number === colNum);
                      if (seat) {
                        return (
                          <SeatButton
                            key={seat.id}
                            label={seat.label}
                            state={getSeatState(seat)}
                            onClick={() => handleSeatClick(seat.id)}
                          />
                        );
                      }
                      return <div key={`empty-r-${rowNum}-${colNum}`} className="w-11 h-11" />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <SeatLegend />
    </div>
  );
}
