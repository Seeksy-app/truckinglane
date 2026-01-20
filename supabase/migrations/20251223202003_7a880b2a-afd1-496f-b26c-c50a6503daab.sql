-- Rename pro_number to load_number
ALTER TABLE public.loads RENAME COLUMN pro_number TO load_number;

-- Rename consignee columns to dest columns
ALTER TABLE public.loads RENAME COLUMN consignee_city TO dest_city;
ALTER TABLE public.loads RENAME COLUMN consignee_state TO dest_state;
ALTER TABLE public.loads RENAME COLUMN consignee_zip TO dest_zip;

-- Rename footage_ft to trailer_footage
ALTER TABLE public.loads RENAME COLUMN footage_ft TO trailer_footage;

-- Rename type_of_shipment to trailer_type
ALTER TABLE public.loads RENAME COLUMN type_of_shipment TO trailer_type;

-- Rename miles_class to miles
ALTER TABLE public.loads RENAME COLUMN miles_class TO miles;

-- Rename description to commodity
ALTER TABLE public.loads RENAME COLUMN description TO commodity;

-- Rename customer_invoice to customer_invoice_total
ALTER TABLE public.loads RENAME COLUMN customer_invoice TO customer_invoice_total;

-- Rename lh_revenue to rate_raw
ALTER TABLE public.loads RENAME COLUMN lh_revenue TO rate_raw;

-- Rename lh_revenue_is_per_ton to is_per_ton
ALTER TABLE public.loads RENAME COLUMN lh_revenue_is_per_ton TO is_per_ton;

-- Rename template_key to template_type
ALTER TABLE public.loads RENAME COLUMN template_key TO template_type;

-- Add target_commission and max_commission columns
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS target_commission numeric DEFAULT 0;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS max_commission numeric DEFAULT 0;

-- Drop the old unique constraint and create new one with renamed columns
ALTER TABLE public.loads DROP CONSTRAINT IF EXISTS loads_agency_id_template_key_pro_number_key;
ALTER TABLE public.loads ADD CONSTRAINT loads_agency_id_template_type_load_number_key UNIQUE (agency_id, template_type, load_number);

-- Update the load_import_runs table to match
ALTER TABLE public.load_import_runs RENAME COLUMN template_key TO template_type;