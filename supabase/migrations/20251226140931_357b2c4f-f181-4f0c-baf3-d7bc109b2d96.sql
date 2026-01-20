-- Add new columns for agency requests
ALTER TABLE public.agency_requests
ADD COLUMN IF NOT EXISTS address_line1 text,
ADD COLUMN IF NOT EXISTS address_line2 text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS zip text,
ADD COLUMN IF NOT EXISTS agent_count text,
ADD COLUMN IF NOT EXISTS daily_load_volume text;