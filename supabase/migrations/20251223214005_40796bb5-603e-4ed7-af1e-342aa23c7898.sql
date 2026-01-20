-- Add booked_at and booked_by columns to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS booked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS booked_by UUID;