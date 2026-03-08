ALTER TABLE public.ticket_validations
  DROP CONSTRAINT ticket_validations_action_check;

ALTER TABLE public.ticket_validations
  ADD CONSTRAINT ticket_validations_action_check
  CHECK (action IN ('checkin', 'checkout', 'reboard', 'undo_checkin', 'undo_checkout', 'undo_reboard'));