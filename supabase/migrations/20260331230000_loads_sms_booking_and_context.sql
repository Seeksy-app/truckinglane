-- SMS booking from tl-trigger.py (SimpleTexting): load flags + per-phone conversation state.
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS sms_book_status text,
  ADD COLUMN IF NOT EXISTS booked_by_phone text,
  ADD COLUMN IF NOT EXISTS booked_by_mc text;

CREATE TABLE IF NOT EXISTS public.tl_sms_booking_context (
  phone_normalized text PRIMARY KEY,
  load_id uuid NOT NULL REFERENCES public.loads (id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'offered' CHECK (stage IN ('offered', 'awaiting_mc')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_sms_booking_context_load_id ON public.tl_sms_booking_context (load_id);

ALTER TABLE public.tl_sms_booking_context ENABLE ROW LEVEL SECURITY;
