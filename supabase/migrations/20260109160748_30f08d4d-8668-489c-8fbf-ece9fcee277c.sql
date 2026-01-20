-- Add shipper and equipment_type columns to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS shipper text,
ADD COLUMN IF NOT EXISTS equipment_type text;

-- Add index for filtering by shipper
CREATE INDEX IF NOT EXISTS idx_leads_shipper ON public.leads(shipper) WHERE shipper IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.leads.shipper IS 'Source shipper/account (e.g., Aldelphia)';
COMMENT ON COLUMN public.leads.equipment_type IS 'Required equipment type (e.g., flatbed, not_flatbed)';