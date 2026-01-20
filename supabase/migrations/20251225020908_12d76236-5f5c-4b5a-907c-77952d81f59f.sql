-- Create high intent keywords table
CREATE TABLE public.high_intent_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  keyword_type TEXT NOT NULL DEFAULT 'custom', -- 'custom', 'load_number', 'lane'
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  premium_response TEXT, -- Optional custom response for this keyword
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 day')
);

-- Enable RLS
ALTER TABLE public.high_intent_keywords ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Agency members can view their keywords"
ON public.high_intent_keywords FOR SELECT
USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can insert keywords"
ON public.high_intent_keywords FOR INSERT
WITH CHECK (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Agency members can delete their keywords"
ON public.high_intent_keywords FOR DELETE
USING (agency_id = get_user_agency_id(auth.uid()));

-- Create index for fast lookups
CREATE INDEX idx_high_intent_keywords_agency_expires 
ON public.high_intent_keywords(agency_id, expires_at);

CREATE INDEX idx_high_intent_keywords_keyword 
ON public.high_intent_keywords(keyword);

-- Add is_high_intent column to loads if not exists
ALTER TABLE public.loads 
ADD COLUMN IF NOT EXISTS is_high_intent BOOLEAN DEFAULT false;