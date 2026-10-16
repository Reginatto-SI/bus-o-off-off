import { useState, useEffect, useMemo, type CSSProperties } from 'react';
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
  showSelectionQuantityLabel?: boolean;
  /** Opt-in presentation only; below lg the original vertical map is retained. */
  desktopHorizontal?: boolean;
}

const getSeatFloor = (seat: Seat) => {
  // Compatibilidade defensiva com layouts antigos/importados: o banco oficial usa `floor`
  // numérico, mas snapshots históricos podem chegar ao componente com variações de nome/valor.
  const rawFloor = (seat as Seat & { floor_number?: number | string; deck?: number | string; level?: number | string }).floor
    ?? (seat as Seat & { floor_number?: number | string }).floor_number
    ?? (seat as Seat & { deck?: number | string }).deck
    ?? (seat as Seat & { level?: number | string }).level
    ?? 1;

  if (typeof rawFloor === 'number' && Number.isFinite(rawFloor)) return rawFloor;

  const normalizedFloor = String(rawFloor).trim().toLowerCase();
  if (['upper', 'superior', 'piso superior'].includes(normalizedFloor)) return 2;
  if (['lower', 'inferior', 'piso inferior'].includes(normalizedFloor)) return 1;

  const parsedFloor = Number.parseInt(normalizedFloor, 10);
  return Number.isFinite(parsedFloor) && parsedFloor > 0 ? parsedFloor : 1;
};

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
  showSelectionQuantityLabel = false,
  desktopHorizontal = false,
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

  const normalizedFloors = Math.max(
    1,
    floors,
    ...seats.map((seat) => getSeatFloor(seat)),
  );

  const availableSeatsByFloor = useMemo(() => {
    // Vagas vendáveis por piso: total de assentos do piso - ocupados - bloqueados operacionais.
    // Mantido no front apenas para apresentação dinâmica sem alterar regra de negócio.
    const blockedSet = new Set(blockedSeatIds);
    const occupiedSet = new Set(occupiedSeatIds);

    return Array.from({ length: normalizedFloors }, (_, index) => {
      const floor = index + 1;
      const floorSeatList = seats.filter((seat) => getSeatFloor(seat) === floor);
      const availableCount = floorSeatList.filter((seat) => {
        if (seat.status === 'bloqueado') return false;
        if (blockedSet.has(seat.id)) return false;
        if (occupiedSet.has(seat.id)) return false;
        return true;
      }).length;

      return { floor, availableCount };
    });
  }, [seats, blockedSeatIds, occupiedSeatIds, normalizedFloors]);


  const floorSeats = seats
    .filter((s) => getSeatFloor(s) === activeFloor)
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

  const firstRow = Math.min(...Array.from(rows.keys()), 1);
  const rowCount = Math.max(...Array.from(rows.keys()), 1) - firstRow + 1;

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
    <div className={`space-y-4${desktopHorizontal ? ' seat-map--desktop-horizontal' : ''}`}>
      {/* Floor selector */}
      {normalizedFloors > 1 && (
        <Tabs className="seat-map__floors" value={String(activeFloor)} onValueChange={(v) => setActiveFloor(Number(v))}>
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
      {normalizedFloors > 1 && (
        <div className="seat-map__floor-context text-center text-xs text-muted-foreground">
          Escolha seu assento no{' '}
          <span className="font-semibold text-foreground">
            {activeFloor === 1 ? 'Piso inferior' : activeFloor === 2 ? 'Piso superior' : `Piso ${activeFloor}`}
          </span>
        </div>
      )}

      {desktopHorizontal && normalizedFloors === 1 && (
        <div className="seat-map__availability hidden lg:block text-xs text-muted-foreground self-center">
          {availableSeatsByFloor[0].availableCount} vagas disponíveis neste piso
        </div>
      )}

      {/* Selection counter */}
      <div className="seat-map__selection-count text-center text-sm font-medium text-foreground">
        Selecionados: <span className="text-primary font-bold">{selectedSeats.length}</span> de {maxSelection}
      </div>

      {/* Rótulo opcional para reforçar quantidade no fluxo administrativo sem alterar checkout público. */}
      {showSelectionQuantityLabel && (
        <div className="seat-map__quantity text-center text-xs text-muted-foreground">
          {selectedSeats.length} passagem{selectedSeats.length === 1 ? '' : 'ens'} selecionada{selectedSeats.length === 1 ? '' : 's'}
        </div>
      )}

      {/* Synced indicator */}
      {showSynced && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 animate-in fade-in duration-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Assentos atualizados em tempo real</span>
        </div>
      )}

      {/* Vehicle body */}
      <div className="seat-map__viewport relative max-w-[320px] mx-auto"
        tabIndex={desktopHorizontal ? 0 : undefined}
        role={desktopHorizontal ? "region" : undefined}
        aria-label={desktopHorizontal ? "Mapa de poltronas — navegue para ver todas as fileiras" : undefined}>
        {/* Loading overlay */}
        {isBlocked && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm font-medium text-foreground">Carregando assentos...</p>
            <p className="text-xs text-muted-foreground mt-1">Sincronizando disponibilidade</p>
          </div>
        )}

        {/* Windshield shape */}
        <div className="seat-map__vehicle bg-muted/30 border-2 border-border rounded-t-[2.5rem] rounded-b-2xl overflow-hidden">
          {/* Driver row */}
          <div className="seat-map__front flex items-center px-4 py-3 border-b border-border/50 bg-muted/40">
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
          <div className="seat-map__grid px-3 py-3 space-y-1.5" style={desktopHorizontal ? {
            '--seat-map-rows': rowCount,
          } as CSSProperties : undefined}>
            {Array.from(rows.entries()).map(([rowNum, rowSeats]) => {
              const leftSeats = rowSeats.filter(s => s.column_number <= corridorAfterCol);
              const rightSeats = rowSeats.filter(s => s.column_number > corridorAfterCol);

              return (
                <div key={rowNum} className="seat-map__row flex items-center justify-center gap-1"
                  data-row={rowNum}
                  style={desktopHorizontal ? { gridColumn: rowNum - firstRow + 1 } : undefined}>
                  {/* Left side */}
                  <div className="seat-map__side flex gap-1" style={{ minWidth: `${corridorAfterCol * 48}px` }}>
                    {Array.from({ length: corridorAfterCol }, (_, i) => {
                      const colNum = i + 1;
                      const seat = leftSeats.find(s => s.column_number === colNum);
                      if (seat) {
                        return (
                          <SeatButton
                            key={seat.id}
                            label={seat.label}
                            desktopStatusLabel={desktopHorizontal}
                            state={getSeatState(seat)}
                            category={seat.category as SeatCategory | undefined}
                            onClick={() => handleSeatClick(seat.id)}
                          />
                        );
                      }
                      return <div key={`empty-l-${rowNum}-${colNum}`} className="seat-map__empty w-11 h-11" />;
                    })}
                  </div>

                  {/* Corridor */}
                  <div className="seat-map__corridor w-6 flex items-center justify-center">
                    <div className="w-px h-8 bg-border/30" />
                  </div>

                  {/* Right side */}
                  <div className="seat-map__side flex gap-1" style={{ minWidth: `${Math.max(Math.max(totalCols - corridorAfterCol, rightSideColumnCount), 1) * 48}px` }}>
                    {Array.from({ length: Math.max(Math.max(totalCols - corridorAfterCol, rightSideColumnCount), 1) }, (_, i) => {
                      const colNum = corridorAfterCol + 1 + i;
                      const seat = rightSeats.find(s => s.column_number === colNum);
                      if (seat) {
                        return (
                          <SeatButton
                            key={seat.id}
                            label={seat.label}
                            desktopStatusLabel={desktopHorizontal}
                            state={getSeatState(seat)}
                            category={seat.category as SeatCategory | undefined}
                            onClick={() => handleSeatClick(seat.id)}
                          />
                        );
                      }
                      return <div key={`empty-r-${rowNum}-${colNum}`} className="seat-map__empty w-11 h-11" />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {desktopHorizontal && <p className="hidden lg:block text-center text-xs text-muted-foreground">
        Frente à esquerda · role o mapa horizontalmente para ver as demais fileiras.
      </p>}

      {/* Legend */}
      <SeatLegend categories={seatCategories} />
    </div>
  );
}
