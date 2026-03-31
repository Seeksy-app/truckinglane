ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS aljex_submitted boolean DEFAULT false;
