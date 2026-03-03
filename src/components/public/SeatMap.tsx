import { useState, useEffect, useMemo } from 'react';
import { Seat, SeatCategory } from '@/types/database';
import { SeatButton, SeatState } from './SeatButton';
import { SeatLegend } from './SeatLegend';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface SeatMapProps {
  seats: Seat[];
  occupiedSeatIds: string[];
  blockedSeatIds?: string[];
  maxSelection: number;
  selectedSeats: string[];
  onSelectionChange: (seatIds: string[]) => void;
  floors: number;
  seatsLeftSide: number;
  seatsRightSide: number;
  loadingStatus?: boolean;
  interactionDisabled?: boolean;
}

export function SeatMap({
  seats,
  occupiedSeatIds,
  blockedSeatIds = [],
  maxSelection,
  selectedSeats,
  onSelectionChange,
  floors,
  seatsLeftSide,
  seatsRightSide,
  loadingStatus = false,
  interactionDisabled = false,
}: SeatMapProps) {
  const [activeFloor, setActiveFloor] = useState(1);
  const [showSynced, setShowSynced] = useState(false);
  const [wasLoading, setWasLoading] = useState(false);

  // Track loading → loaded transition to show "synced" indicator
  useEffect(() => {
    if (loadingStatus || interactionDisabled) {
      setWasLoading(true);
      setShowSynced(false);
    } else if (wasLoading) {
      setShowSynced(true);
      setWasLoading(false);
      const timer = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [loadingStatus, interactionDisabled, wasLoading]);

  const isBlocked = loadingStatus || interactionDisabled;

  const seatCategories = seats.map((s) => (s.category || 'convencional') as SeatCategory);

  const availableSeatsByFloor = useMemo(() => {
    // Vagas vendáveis por piso: total de assentos do piso - ocupados - bloqueados operacionais.
    // Mantido no front apenas para apresentação dinâmica sem alterar regra de negócio.
    const blockedSet = new Set(blockedSeatIds);
    const occupiedSet = new Set(occupiedSeatIds);

    return Array.from({ length: floors }, (_, index) => {
      const floor = index + 1;
      const floorSeatList = seats.filter((seat) => seat.floor === floor);
      const availableCount = floorSeatList.filter((seat) => {
        if (seat.status === 'bloqueado') return false;
        if (blockedSet.has(seat.id)) return false;
        if (occupiedSet.has(seat.id)) return false;
        return true;
      }).length;

      return { floor, availableCount };
    });
  }, [seats, blockedSeatIds, occupiedSeatIds, floors]);


  const floorSeats = seats
    .filter((s) => s.floor === activeFloor)
    .sort((a, b) => {
      if (a.row_number !== b.row_number) return a.row_number - b.row_number;
      return a.column_number - b.column_number;
    });

  const maxCol = Math.max(...floorSeats.map((s) => s.column_number), 0);
  const totalCols = maxCol;

  const rows = new Map<number, Seat[]>();
  floorSeats.forEach((s) => {
    const existing = rows.get(s.row_number) || [];
    existing.push(s);
    rows.set(s.row_number, existing);
  });

  const getSeatState = (seat: Seat): SeatState => {
    // Mantém coerência com o status real: bloqueios operacionais têm prioridade visual.
    // Isso evita que uma poltrona bloqueada seja exibida como ocupada no mapa público.
    if (seat.status === 'bloqueado') return 'blocked';
    if (blockedSeatIds.includes(seat.id)) return 'blocked';
    if (occupiedSeatIds.includes(seat.id)) return 'occupied';
    if (selectedSeats.includes(seat.id)) return 'selected';
    return 'available';
  };

  const handleSeatClick = (seatId: string) => {
    if (isBlocked) return;

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

  const corridorAfterCol = Math.max(1, seatsLeftSide);
  const rightSideColumnCount = Math.max(1, seatsRightSide);

  return (
    <div className="space-y-4">
      {/* Floor selector */}
      {floors > 1 && (
        <Tabs value={String(activeFloor)} onValueChange={(v) => setActiveFloor(Number(v))}>
          <TabsList className="w-full h-auto gap-1 p-1">
            {availableSeatsByFloor.map(({ floor, availableCount }) => (
              <TabsTrigger
                key={floor}
                value={String(floor)}
                className="flex-1 h-auto py-2 data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-primary/30"
              >
                <span className="flex flex-col leading-tight text-center">
                  <span>{floor === 1 ? 'Piso inferior' : floor === 2 ? 'Piso superior' : `Piso ${floor}`}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {availableCount} vaga{availableCount === 1 ? '' : 's'} disponível{availableCount === 1 ? '' : 'is'}
                  </span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Contexto dinâmico para reforçar o piso ativo sem exigir leitura dos botões. */}
      {floors > 1 && (
        <div className="text-center text-xs text-muted-foreground">
          Escolha seu assento no{' '}
          <span className="font-semibold text-foreground">
            {activeFloor === 1 ? 'Piso inferior' : activeFloor === 2 ? 'Piso superior' : `Piso ${activeFloor}`}
          </span>
        </div>
      )}

      {/* Selection counter */}
      <div className="text-center text-sm font-medium text-foreground">
        Selecionados: <span className="text-primary font-bold">{selectedSeats.length}</span> de {maxSelection}
      </div>

      {/* Synced indicator */}
      {showSynced && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 animate-in fade-in duration-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Assentos atualizados em tempo real</span>
        </div>
      )}

      {/* Vehicle body */}
      <div className="relative max-w-[320px] mx-auto">
        {/* Loading overlay */}
        {isBlocked && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm font-medium text-foreground">Carregando assentos...</p>
            <p className="text-xs text-muted-foreground mt-1">Sincronizando disponibilidade</p>
          </div>
        )}

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
                            category={seat.category as SeatCategory | undefined}
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
                            category={seat.category as SeatCategory | undefined}
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
      <SeatLegend categories={seatCategories} />
    </div>
  );
}
