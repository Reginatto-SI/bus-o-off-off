import { useState } from 'react';
import { Seat } from '@/types/database';
import { SeatButton, SeatState } from './SeatButton';
import { SeatLegend } from './SeatLegend';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { UserRound } from 'lucide-react';

interface SeatMapProps {
  seats: Seat[];
  occupiedSeatIds: string[];
  maxSelection: number;
  selectedSeats: string[];
  onSelectionChange: (seatIds: string[]) => void;
  floors: number;
}

export function SeatMap({
  seats,
  occupiedSeatIds,
  maxSelection,
  selectedSeats,
  onSelectionChange,
  floors,
}: SeatMapProps) {
  const [activeFloor, setActiveFloor] = useState(1);

  const floorSeats = seats
    .filter((s) => s.floor === activeFloor)
    .sort((a, b) => {
      if (a.row_number !== b.row_number) return a.row_number - b.row_number;
      return a.column_number - b.column_number;
    });

  // Determine max columns for this floor
  const maxCol = Math.max(...floorSeats.map((s) => s.column_number), 0);
  const totalCols = maxCol; // 4 for bus (2+corridor+2), 3 for van (2+corridor+1)
  const corridorAfter = totalCols <= 3 ? 2 : 2; // corridor is always after column 2

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

  // Render grid columns: col1, col2, corridor, col3, (col4 if bus)
  const gridCols = totalCols <= 3 ? 'grid-cols-[1fr_1fr_1.2fr_1fr]' : 'grid-cols-[1fr_1fr_1.2fr_1fr_1fr]';

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
        Selecionados: <span className="text-primary">{selectedSeats.length}</span> de {maxSelection}
      </div>

      {/* Bus body */}
      <div className="bg-card border-2 border-border rounded-2xl p-4 max-w-[280px] mx-auto">
        {/* Driver row */}
        <div className="flex items-center justify-end mb-4 pr-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <div className="w-10 h-10 rounded-lg border border-border bg-muted/40 flex items-center justify-center">
              <UserRound className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Seat grid */}
        <div className="space-y-2">
          {Array.from(rows.entries()).map(([rowNum, rowSeats]) => (
            <div key={rowNum} className={`grid ${gridCols} gap-1 items-center`}>
              {Array.from({ length: totalCols }, (_, colIdx) => {
                const colNum = colIdx + 1;
                const seat = rowSeats.find((s) => s.column_number === colNum);

                // Insert corridor gap after column 2
                const elements = [];
                if (colNum === corridorAfter + 1) {
                  elements.push(<div key={`corridor-${rowNum}`} className="w-full" />);
                }

                if (seat) {
                  elements.push(
                    <SeatButton
                      key={seat.id}
                      label={seat.label}
                      state={getSeatState(seat)}
                      onClick={() => handleSeatClick(seat.id)}
                    />
                  );
                } else {
                  elements.push(<div key={`empty-${rowNum}-${colNum}`} />);
                }

                return elements;
              }).flat()}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <SeatLegend />
    </div>
  );
}
