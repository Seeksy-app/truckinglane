-- Enable RLS on leads table (policies already exist but RLS was not enabled)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Enable RLS on agency_members table (policies already exist but RLS was not enabled)
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;