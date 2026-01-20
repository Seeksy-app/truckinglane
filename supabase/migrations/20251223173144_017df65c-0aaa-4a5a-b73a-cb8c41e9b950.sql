-- Create loads table
CREATE TABLE public.loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  pro_number text NOT NULL,
  type_of_shipment text,
  dispatch_status text,
  ship_date date,
  pickup_city text,
  pickup_state text,
  pickup_zip text,
  consignee_city text,
  consignee_state text,
  consignee_zip text,
  description text,
  weight_lbs numeric,
  footage_ft numeric,
  miles_class text,
  lh_revenue numeric,
  tarps text,
  tarp_size text,
  
  -- Computed/stored fields
  customer_invoice numeric NOT NULL,
  target_pay numeric NOT NULL,
  max_pay numeric NOT NULL,
  commission_target_pct numeric NOT NULL DEFAULT 0.20,
  commission_max_pct numeric NOT NULL DEFAULT 0.15,
  
  -- For future per-ton logic
  lh_revenue_is_per_ton boolean NOT NULL DEFAULT false,
  
  -- Status fields
  status text NOT NULL DEFAULT 'open',
  booked_by uuid REFERENCES auth.users(id),
  booked_at timestamptz,
  closed_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Uniqueness constraint
  UNIQUE(agency_id, template_key, pro_number)
);

-- Create load_import_runs table
CREATE TABLE public.load_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  row_count integer,
  replaced_count integer
);

-- Enable RLS
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_import_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for loads
CREATE POLICY "Agency members can view their loads"
ON public.loads
FOR SELECT
USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can insert loads"
ON public.loads
FOR INSERT
WITH CHECK (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can update their loads"
ON public.loads
FOR UPDATE
USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can delete their loads"
ON public.loads
FOR DELETE
USING (agency_id = get_user_agency_id(auth.uid()));

-- RLS policies for load_import_runs
CREATE POLICY "Agency members can view their import runs"
ON public.load_import_runs
FOR SELECT
USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can insert import runs"
ON public.load_import_runs
FOR INSERT
WITH CHECK (agency_id = get_user_agency_id(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_loads_updated_at
BEFORE UPDATE ON public.loads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();