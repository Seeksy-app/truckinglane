-- Add load_call_script column to loads table
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS load_call_script text;

-- Add pickup_location_raw and dest_location_raw for combined location strings
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS pickup_location_raw text;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS dest_location_raw text;

-- Add source_row for storing original CSV/XLSX row data
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS source_row jsonb DEFAULT '{}'::jsonb;

-- Add delivery_date column (alias for ship_date for Adelphia template)
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS delivery_date date;

-- Add tarp_required boolean column
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS tarp_required boolean DEFAULT false;

-- Create index for template_type filtering
CREATE INDEX IF NOT EXISTS idx_loads_agency_template ON public.loads(agency_id, template_type);
CREATE INDEX IF NOT EXISTS idx_loads_agency_status ON public.loads(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_loads_ship_date ON public.loads(ship_date);