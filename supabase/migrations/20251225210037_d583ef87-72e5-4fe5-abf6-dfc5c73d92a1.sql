-- Add fit_score_breakdown column to store deterministic scoring breakdown
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS fit_score_breakdown jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.accounts.fit_score_breakdown IS 'V1 Locked scoring breakdown: { commodity: 0-30, equipment: 0-20, fmcsa: 0-20, geography: 0-10, scale: 0-10, website: 0-10 }';