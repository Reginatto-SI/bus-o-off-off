ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.seat_locks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_locks;