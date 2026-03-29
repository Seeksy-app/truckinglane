-- Normalize customer_name for Aljex spot auto-submit (must match extension CUSTOMER_IDS keys).
UPDATE public.loads
SET customer_name = 'VMS'
WHERE template_type = 'vms_email' AND customer_name IS NULL;

UPDATE public.loads
SET customer_name = 'OLDCASTLE'
WHERE template_type = 'oldcastle_gsheet' AND customer_name IS NULL;

UPDATE public.loads
SET customer_name = 'CENTURY ENTERPRISES'
WHERE template_type = 'century_xlsx' AND customer_name IS NULL;

UPDATE public.loads
SET dispatch_status = 'open'
WHERE template_type IN ('vms_email', 'oldcastle_gsheet', 'century_xlsx')
  AND dispatch_status IS NULL;
