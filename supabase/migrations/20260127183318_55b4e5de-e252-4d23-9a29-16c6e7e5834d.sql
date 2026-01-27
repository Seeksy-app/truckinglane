-- Add email import configuration fields to agencies table
ALTER TABLE public.agencies
ADD COLUMN IF NOT EXISTS import_email_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS allowed_sender_domains TEXT[] DEFAULT '{}';

-- Add index for quick lookup by import code
CREATE INDEX IF NOT EXISTS idx_agencies_import_email_code ON public.agencies(import_email_code) WHERE import_email_code IS NOT NULL;

-- Create table to log email import attempts for auditing
CREATE TABLE IF NOT EXISTS public.email_import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID REFERENCES public.agencies(id),
  sender_email TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  imported_count INTEGER DEFAULT 0,
  error_message TEXT,
  raw_headers JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on email_import_logs
ALTER TABLE public.email_import_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy: agency members can view their agency's import logs
CREATE POLICY "Agency members can view their import logs"
ON public.email_import_logs
FOR SELECT
USING (
  agency_id IN (
    SELECT agency_id FROM public.agency_members WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.agency_members 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- Add comment for documentation
COMMENT ON COLUMN public.agencies.import_email_code IS 'Unique code for email import subject line matching (e.g., ADELPHIA IMPORT - [CODE])';
COMMENT ON COLUMN public.agencies.allowed_sender_domains IS 'Array of whitelisted sender email domains for import (e.g., {"adelphia.com", "dispatch.adelphia.com"})';