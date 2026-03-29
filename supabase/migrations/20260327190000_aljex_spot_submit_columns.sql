ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS aljex_submitted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aljex_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS aljex_spot_number text,
  ADD COLUMN IF NOT EXISTS customer_name text;

COMMENT ON COLUMN public.loads.aljex_submitted IS 'True after Chrome extension submitted this load as an Aljex spot.';
COMMENT ON COLUMN public.loads.aljex_spot_number IS 'Aljex-assigned spot number after successful submit.';
COMMENT ON COLUMN public.loads.customer_name IS 'Broker/customer display name for Aljex CustID mapping and filters.';

UPDATE public.loads
SET customer_name = 'ADELPHIA METALS'
WHERE template_type = 'adelphia_xlsx' AND customer_name IS NULL;

UPDATE public.loads
SET dispatch_status = 'open'
WHERE template_type IN ('adelphia_xlsx', 'century_xlsx') AND dispatch_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_loads_aljex_pending_submit
  ON public.loads (agency_id, ship_date)
  WHERE is_active = true
    AND (aljex_submitted IS NOT TRUE)
    AND dispatch_status = 'open';
