import { supabase } from '@/integrations/supabase/client';

// Comentário P0: sincronização idempotente layout_snapshot → seats.
// Garante que assentos no banco reflitam exatamente o snapshot do veículo.
// Reescrito com fases seguras para evitar conflito de labels (UNIQUE vehicle_id+label).
type SnapshotSeatItem = {
  floor_number: number;
  row_number: number;
  column_number: number;
  seat_number?: string | null;
  category?: string;
  is_blocked?: boolean;
};

type SeatLayoutSnapshot = { items?: unknown };

export interface SeatSyncResult {
  inserted: number;
  updated: number;
  deleted: number;
  blocked: number;
  capacity: number;
  errors: string[];
}

export interface SnapshotSellableSeatSummary {
  total: number;
  byFloor: Record<number, number>;
}

export function getSnapshotSellableSeatSummary(snapshot: SeatLayoutSnapshot | null): SnapshotSellableSeatSummary {
  if (!snapshot || !snapshot.items || !Array.isArray(snapshot.items)) return { total: 0, byFloor: {} };

  const items = snapshot.items as SnapshotSeatItem[];
  return items.reduce<SnapshotSellableSeatSummary>((acc, item) => {
    // Mesma regra do sync: todo item não bloqueado é vendável, mesmo sem seat_number,
    // pois a sincronização gera uma numeração sequencial nesse caso.
    if (item.is_blocked) return acc;

    const floor = Number(item.floor_number || 1);
    acc.total += 1;
    acc.byFloor[floor] = (acc.byFloor[floor] ?? 0) + 1;
    return acc;
  }, { total: 0, byFloor: {} });
}

export async function syncSeatsFromSnapshot(
  vehicleId: string,
  companyId: string,
  snapshot: SeatLayoutSnapshot | null,
  options: { updateVehicleCapacity?: boolean } = {},
): Promise<SeatSyncResult> {
  const result: SeatSyncResult = { inserted: 0, updated: 0, deleted: 0, blocked: 0, capacity: 0, errors: [] };

  if (!snapshot || !snapshot.items || !Array.isArray(snapshot.items)) return result;

  const items = snapshot.items as SnapshotSeatItem[];
  const expectedSummary = getSnapshotSellableSeatSummary(snapshot);
  result.capacity = expectedSummary.total;

  type CurrentSeat = { id: string; label: string; floor: number; row_number: number; column_number: number; category: string; status: string };

  // === FASE 0: Limpar lixo técnico (_legacy_ e _tmp_) sem tickets vinculados ===
  // Isso evita acúmulo progressivo de seats fantasmas a cada re-sync.
  {
    // Buscar todos os seats técnicos do veículo
    const { data: techSeats } = await supabase
      .from('seats')
      .select('id, label')
      .eq('vehicle_id', vehicleId)
      .or('label.ilike._legacy_%,label.ilike._tmp_%');

    if (techSeats && techSeats.length > 0) {
      const techIds = techSeats.map((s) => s.id);

      // Verificar quais têm tickets vinculados
      const { data: linkedTickets } = await supabase
        .from('tickets')
        .select('seat_id')
        .in('seat_id', techIds);

      const linkedIds = new Set((linkedTickets ?? []).filter((t) => t.seat_id).map((t) => t.seat_id!));
      const toClean = techIds.filter((id) => !linkedIds.has(id));

      if (toClean.length > 0) {
        const { error: cleanErr } = await supabase
          .from('seats')
          .delete()
          .in('id', toClean);

        if (cleanErr) {
          result.errors.push(`Erro ao limpar seats técnicos: ${cleanErr.message}`);
        } else {
          result.deleted += toClean.length;
          console.log(`[syncSeats] FASE 0: removidos ${toClean.length} seats técnicos (_legacy_/_tmp_)`);
        }
      }
    }
  }

  // === FASE 1: Montar estado desejado ===
  // Numerar sequencialmente (items já vêm ordenados do snapshot)
  let seatNumber = 1;
  const desiredSeats = items.map((item) => {
    const label = item.is_blocked
      ? (item.seat_number || 'X')
      : (item.seat_number || String(seatNumber++));
    if (!item.is_blocked && !item.seat_number) {
      // seat_number was auto-assigned
    }
    return {
      floor: item.floor_number,
      row_number: item.row_number,
      column_number: item.column_number,
      label,
      status: item.is_blocked ? 'bloqueado' as const : 'disponivel' as const,
      category: item.category || 'convencional',
      coordKey: `${item.floor_number}-${item.row_number}-${item.column_number}`,
    };
  });

  const desiredCoordMap = new Map(desiredSeats.map((s) => [s.coordKey, s]));

  // === FASE 2: Buscar seats existentes do veículo ===
  const { data: existingSeats, error: fetchErr } = await supabase
    .from('seats')
    .select('id, label, floor, row_number, column_number, category, status')
    .eq('vehicle_id', vehicleId);

  if (fetchErr) {
    result.errors.push(`Erro ao buscar assentos: ${fetchErr.message}`);
    throw new Error(result.errors[0]);
  }

  const existing = existingSeats ?? [];

  // === FASE 3: Identificar órfãos (assentos fora do snapshot) ===
  const orphanSeats = existing.filter((s) => !desiredCoordMap.has(`${s.floor}-${s.row_number}-${s.column_number}`));
  const orphanIds = orphanSeats.map((s) => s.id);

  // Verificar tickets vinculados a órfãos
  let linkedSeatIds = new Set<string>();
  if (orphanIds.length > 0) {
    const { data: linkedTickets } = await supabase
      .from('tickets')
      .select('seat_id')
      .in('seat_id', orphanIds);
    linkedSeatIds = new Set((linkedTickets ?? []).filter((t) => t.seat_id).map((t) => t.seat_id!));
  }

  // === FASE 4: Deletar/bloquear órfãos PRIMEIRO (libera labels) ===
  const orphansToDelete = orphanSeats.filter((s) => !linkedSeatIds.has(s.id));
  const orphansToBlock = orphanSeats.filter((s) => linkedSeatIds.has(s.id));

  if (orphansToDelete.length > 0) {
    const { error: delErr } = await supabase.from('seats').delete().in('id', orphansToDelete.map((s) => s.id));
    if (delErr) {
      result.errors.push(`Erro ao deletar órfãos: ${delErr.message}`);
    } else {
      result.deleted = orphansToDelete.length;
    }
  }

  // Órfãos com ticket: renomear label para técnica única e bloquear
  for (const orphan of orphansToBlock) {
    const techLabel = `_legacy_${orphan.id.slice(0, 8)}`;
    const { error: blockErr } = await supabase
      .from('seats')
      .update({ status: 'bloqueado', label: techLabel })
      .eq('id', orphan.id);
    if (blockErr) {
      result.errors.push(`Erro ao bloquear órfão ${orphan.label}: ${blockErr.message}`);
    } else {
      result.blocked++;
    }
  }

  // Rebuild existingByLabel after orphan cleanup (orphan labels are now freed)
  // Re-fetch to get current state
  const { data: currentSeats } = await supabase
    .from('seats')
    .select('id, label, floor, row_number, column_number, category, status')
    .eq('vehicle_id', vehicleId);

  const currentByCoord = new Map((currentSeats ?? []).map((s) => [`${s.floor}-${s.row_number}-${s.column_number}`, s as CurrentSeat]));
  const currentByLabel = new Map((currentSeats ?? []).map((s) => [s.label, s as CurrentSeat]));

  // === FASE 5: Atualizar assentos que permanecem (mesma coordenada) ===
  for (const desired of desiredSeats) {
    const existingSeat = currentByCoord.get(desired.coordKey);
    if (existingSeat) {
      // Check if label is changing and new label conflicts with another seat
      if (existingSeat.label !== desired.label) {
        const conflicting = currentByLabel.get(desired.label);
        if (conflicting && conflicting.id !== existingSeat.id) {
          // Temporarily rename conflicting seat to avoid unique violation
          const tempLabel = `_tmp_${conflicting.id.slice(0, 8)}`;
          await supabase.from('seats').update({ label: tempLabel }).eq('id', conflicting.id);
          currentByLabel.delete(desired.label);
          currentByLabel.set(tempLabel, { ...conflicting, label: tempLabel });
        }
      }

      const needsUpdate =
        existingSeat.label !== desired.label ||
        existingSeat.status !== desired.status ||
        existingSeat.category !== desired.category;

      if (needsUpdate) {
        const { error: updErr } = await supabase
          .from('seats')
          .update({ label: desired.label, status: desired.status, category: desired.category })
          .eq('id', existingSeat.id);
        if (updErr) {
          result.errors.push(`Erro ao atualizar ${desired.label}: ${updErr.message}`);
        } else {
          result.updated++;
          currentByLabel.delete(existingSeat.label);
          currentByLabel.set(desired.label, { ...existingSeat, label: desired.label });
        }
      }
    }
  }

  // === FASE 6: Inserir assentos faltantes ===
  const toInsert = desiredSeats
    .filter((d) => !currentByCoord.has(d.coordKey))
    .map((d) => ({
      vehicle_id: vehicleId,
      company_id: companyId,
      label: d.label,
      floor: d.floor,
      row_number: d.row_number,
      column_number: d.column_number,
      status: d.status,
      category: d.category,
    }));

  if (toInsert.length > 0) {
    // Insert in batches to handle label conflicts gracefully
    for (const seat of toInsert) {
      // Check if label still conflicts
      const conflicting = currentByLabel.get(seat.label);
      if (conflicting?.id) {
        const tempLabel = `_tmp_${conflicting.id.slice(0, 8)}`;
        await supabase.from('seats').update({ label: tempLabel }).eq('id', conflicting.id);
        currentByLabel.delete(seat.label);
        currentByLabel.set(tempLabel, { ...conflicting, label: tempLabel });
      }

      const { data: insertedSeat, error: insErr } = await supabase
        .from('seats')
        .insert(seat)
        .select('id, label, floor, row_number, column_number, category, status')
        .maybeSingle();
      if (insErr || !insertedSeat) {
        result.errors.push(`Erro ao inserir ${seat.label}: ${insErr?.message ?? 'assento não retornado'}`);
      } else {
        result.inserted++;
        currentByLabel.set(insertedSeat.label, insertedSeat as CurrentSeat);
      }
    }
  }

  // === FASE 7: capacidade oficial calculada do snapshot ===
  // Por padrão a Frota atualiza vehicles.capacity ao sincronizar. Chamadores como /admin/eventos
  // podem desativar esse update e usar apenas o retorno para preencher trips.capacity.
  const calculatedCapacity = expectedSummary.total;
  result.capacity = calculatedCapacity;
  if (options.updateVehicleCapacity !== false) {
    await supabase.from('vehicles').update({ capacity: calculatedCapacity }).eq('id', vehicleId);
  }

  // === FASE 8: Validação final ===
  const { data: finalSeats } = await supabase
    .from('seats')
    .select('category, status')
    .eq('vehicle_id', vehicleId)
    .not('label', 'like', '_legacy_%')
    .not('label', 'like', '_tmp_%');

  const finalSellable = (finalSeats ?? []).filter((s) => s.status === 'disponivel').length;
  const expectedSellable = calculatedCapacity;

  if (finalSellable !== expectedSellable) {
    result.errors.push(`Divergência: esperado ${expectedSellable} vendáveis, encontrado ${finalSellable}`);
  }

  return result;
}

