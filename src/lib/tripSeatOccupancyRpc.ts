import { supabase } from '@/integrations/supabase/client';

type SeatOccupancyRow = {
  seat_id: string | null;
  is_blocked: boolean | null;
};

export async function getTripSeatOccupancyRpc(params: {
  tripId: string;
  context: 'manual_sale' | 'public_checkout';
}) {
  const { tripId, context } = params;
  const payload = { _trip_id: tripId };
  const result = await supabase.rpc('get_trip_seat_occupancy', payload);

  if (result.error) {
    console.error('[seat-occupancy] rpc_call_failed', {
      context,
      tripId,
      rpcName: 'get_trip_seat_occupancy',
      payload,
      message: result.error.message,
      code: result.error.code,
      details: result.error.details,
      hint: result.error.hint,
    });
    throw result.error;
  }

  return {
    rows: (result.data ?? []) as SeatOccupancyRow[],
  };
}
