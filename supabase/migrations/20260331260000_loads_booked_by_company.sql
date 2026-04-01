ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS booked_by_company text;
