-- Add columns to loads table for close reason
ALTER TABLE public.loads 
ADD COLUMN IF NOT EXISTS close_reason text;

-- Add columns to leads table for carrier verification
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS carrier_usdot text,
ADD COLUMN IF NOT EXISTS carrier_mc text,
ADD COLUMN IF NOT EXISTS carrier_name text,
ADD COLUMN IF NOT EXISTS carrier_verified_at timestamp with time zone;