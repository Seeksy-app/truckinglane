-- Add intent_reason_breakdown column to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS intent_reason_breakdown jsonb DEFAULT '[]'::jsonb;