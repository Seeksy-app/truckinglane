-- Create ai_call_summaries table for persistent call analysis
CREATE TABLE IF NOT EXISTS public.ai_call_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text UNIQUE NOT NULL,
  call_sid text,
  agent_id text,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration_secs integer,
  call_outcome text,
  is_high_intent boolean DEFAULT false,
  high_intent_reasons jsonb DEFAULT '[]'::jsonb,
  carrier_usdot text,
  carrier_mc text,
  carrier_name text,
  termination_reason text,
  summary_title text,
  summary text,
  summary_short text,
  transcript text,
  external_number text,
  agent_number text,
  callback_speed_secs integer,
  agency_id uuid REFERENCES public.agencies(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_call_summaries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Agency members can view their ai_call_summaries"
ON public.ai_call_summaries FOR SELECT
USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Super admins can manage ai_call_summaries"
ON public.ai_call_summaries FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

-- Create updated_at trigger
CREATE TRIGGER update_ai_call_summaries_updated_at
BEFORE UPDATE ON public.ai_call_summaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient lookups
CREATE INDEX idx_ai_call_summaries_agency_id ON public.ai_call_summaries(agency_id);
CREATE INDEX idx_ai_call_summaries_created_at ON public.ai_call_summaries(created_at DESC);
CREATE INDEX idx_ai_call_summaries_is_high_intent ON public.ai_call_summaries(is_high_intent) WHERE is_high_intent = true;