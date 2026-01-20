-- Add address column to agency_requests table
ALTER TABLE public.agency_requests
ADD COLUMN owner_address text;