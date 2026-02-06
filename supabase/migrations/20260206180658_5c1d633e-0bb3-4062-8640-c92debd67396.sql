-- Add account_type to agency_requests table
ALTER TABLE public.agency_requests 
ADD COLUMN account_type text NOT NULL DEFAULT 'agency' 
CHECK (account_type IN ('agency', 'broker'));