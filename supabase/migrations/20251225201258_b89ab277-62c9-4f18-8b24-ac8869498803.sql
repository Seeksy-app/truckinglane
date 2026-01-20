-- Create accounts table for lead generation
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  website text,
  type text NOT NULL DEFAULT 'unknown' CHECK (type IN ('broker', 'shipper', 'carrier', 'unknown')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('firecrawl', 'fmcsa', 'inbound', 'manual')),
  commodities text[] DEFAULT '{}',
  equipment_types text[] DEFAULT '{}',
  regions text[] DEFAULT '{}',
  contact_email text,
  contact_phone text,
  mc_number text,
  dot_number text,
  fit_score integer DEFAULT 0 CHECK (fit_score >= 0 AND fit_score <= 100),
  notes text,
  fmcsa_data jsonb DEFAULT '{}',
  ai_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create account_events table for audit trail
CREATE TABLE public.account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('discovered', 'enriched', 'called', 'qualified', 'rejected', 'scored', 'queued', 'note_added')),
  meta jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create prospecting_queue table
CREATE TABLE public.prospecting_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  reason text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'contacted', 'paused', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

-- Create indexes
CREATE INDEX idx_accounts_agency_id ON public.accounts(agency_id);
CREATE INDEX idx_accounts_type ON public.accounts(type);
CREATE INDEX idx_accounts_fit_score ON public.accounts(fit_score DESC);
CREATE INDEX idx_accounts_source ON public.accounts(source);
CREATE INDEX idx_account_events_account_id ON public.account_events(account_id);
CREATE INDEX idx_account_events_type ON public.account_events(event_type);
CREATE INDEX idx_prospecting_queue_agency ON public.prospecting_queue(agency_id);
CREATE INDEX idx_prospecting_queue_priority ON public.prospecting_queue(priority);
CREATE INDEX idx_prospecting_queue_status ON public.prospecting_queue(status);

-- Enable RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospecting_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for accounts
CREATE POLICY "Agency members can view their accounts"
  ON public.accounts FOR SELECT
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can insert accounts"
  ON public.accounts FOR INSERT
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can update their accounts"
  ON public.accounts FOR UPDATE
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can delete their accounts"
  ON public.accounts FOR DELETE
  USING (agency_id = get_user_agency_id(auth.uid()));

-- RLS policies for account_events
CREATE POLICY "Agency members can view their account events"
  ON public.account_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = account_events.account_id
    AND a.agency_id = get_user_agency_id(auth.uid())
  ));

CREATE POLICY "Agency members can insert account events"
  ON public.account_events FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = account_events.account_id
    AND a.agency_id = get_user_agency_id(auth.uid())
  ));

-- RLS policies for prospecting_queue
CREATE POLICY "Agency members can view their prospecting queue"
  ON public.prospecting_queue FOR SELECT
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can insert to prospecting queue"
  ON public.prospecting_queue FOR INSERT
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can update their prospecting queue"
  ON public.prospecting_queue FOR UPDATE
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can delete from prospecting queue"
  ON public.prospecting_queue FOR DELETE
  USING (agency_id = get_user_agency_id(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prospecting_queue_updated_at
  BEFORE UPDATE ON public.prospecting_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();