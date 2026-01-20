-- Create carrier_intelligence table - normalized carrier object with cached FMCSA data
CREATE TABLE public.carrier_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  usdot text NOT NULL,
  carrier_name text,
  
  -- Cached FMCSA data
  fmcsa_data jsonb DEFAULT '{}'::jsonb,
  fmcsa_fetched_at timestamp with time zone,
  
  -- AI activity aggregates (rolled up from calls)
  ai_activity jsonb DEFAULT '{
    "total_calls": 0,
    "completed_calls": 0,
    "callback_requested": 0,
    "declined": 0,
    "avg_call_duration_secs": 0,
    "sentiment_breakdown": {"positive": 0, "neutral": 0, "negative": 0}
  }'::jsonb,
  
  -- AI insights
  ai_insights jsonb DEFAULT '{
    "conversion_likelihood": 0,
    "risk_score": 0,
    "recommended_action": null
  }'::jsonb,
  
  last_call_outcome text,
  last_call_at timestamp with time zone,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Unique constraint per agency + usdot
  CONSTRAINT carrier_intelligence_agency_usdot_unique UNIQUE (agency_id, usdot)
);

-- Add usdot column to phone_calls for linking calls to carriers
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS carrier_usdot text;

-- Enable RLS
ALTER TABLE public.carrier_intelligence ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Agency members can view their carrier intelligence"
  ON public.carrier_intelligence FOR SELECT
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can insert carrier intelligence"
  ON public.carrier_intelligence FOR INSERT
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can update their carrier intelligence"
  ON public.carrier_intelligence FOR UPDATE
  USING (agency_id = get_user_agency_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_carrier_intelligence_updated_at
  BEFORE UPDATE ON public.carrier_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookup
CREATE INDEX idx_carrier_intelligence_usdot ON public.carrier_intelligence(usdot);
CREATE INDEX idx_carrier_intelligence_agency ON public.carrier_intelligence(agency_id);
CREATE INDEX idx_phone_calls_carrier_usdot ON public.phone_calls(carrier_usdot) WHERE carrier_usdot IS NOT NULL;