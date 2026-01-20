-- =============================================
-- HIGH INTENT KEYWORDS V1.5 - ANALYTICS & CAPS
-- =============================================

-- 1) KEYWORD MATCH EVENTS TABLE
-- Logs whenever a lead matches a keyword
CREATE TABLE IF NOT EXISTS public.keyword_match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES public.high_intent_keywords(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('call_transcript', 'ai_chat', 'notes', 'manual')),
  matched_text text,
  booked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX idx_keyword_match_events_keyword ON public.keyword_match_events(keyword_id);
CREATE INDEX idx_keyword_match_events_lead ON public.keyword_match_events(lead_id);
CREATE INDEX idx_keyword_match_events_agency ON public.keyword_match_events(agency_id);
CREATE INDEX idx_keyword_match_events_created ON public.keyword_match_events(created_at);

-- Enable RLS
ALTER TABLE public.keyword_match_events ENABLE ROW LEVEL SECURITY;

-- RLS: Agents can view match events for their keywords or global keywords in their agency
CREATE POLICY "View own and global match events"
ON public.keyword_match_events
FOR SELECT
USING (
  agency_id = get_user_agency_id(auth.uid()) 
  AND (
    agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM high_intent_keywords k 
      WHERE k.id = keyword_match_events.keyword_id 
      AND k.scope = 'global'
    )
    OR has_role(auth.uid(), 'agency_admin')
    OR has_role(auth.uid(), 'super_admin')
  )
);

-- RLS: Insert match events (system/edge function or agents for manual)
CREATE POLICY "Insert match events"
ON public.keyword_match_events
FOR INSERT
WITH CHECK (
  agency_id = get_user_agency_id(auth.uid())
);

-- RLS: Update match events (for booked_at attribution)
CREATE POLICY "Update match events"
ON public.keyword_match_events
FOR UPDATE
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);

-- 2) KEYWORD SUGGESTIONS TABLE
-- Auto-suggested keywords from booked loads
CREATE TABLE IF NOT EXISTS public.keyword_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  load_id uuid REFERENCES public.loads(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  keyword_type text NOT NULL DEFAULT 'custom' CHECK (keyword_type IN ('custom', 'city', 'lane', 'load', 'commodity')),
  suggested_scope text NOT NULL DEFAULT 'agent' CHECK (suggested_scope IN ('agent', 'global')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_keyword_suggestions_agency ON public.keyword_suggestions(agency_id);
CREATE INDEX idx_keyword_suggestions_status ON public.keyword_suggestions(status);

-- Enable RLS
ALTER TABLE public.keyword_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS: View suggestions in own agency
CREATE POLICY "View agency suggestions"
ON public.keyword_suggestions
FOR SELECT
USING (agency_id = get_user_agency_id(auth.uid()));

-- RLS: Insert suggestions
CREATE POLICY "Insert agency suggestions"
ON public.keyword_suggestions
FOR INSERT
WITH CHECK (agency_id = get_user_agency_id(auth.uid()));

-- RLS: Update suggestions (accept/dismiss)
CREATE POLICY "Update agency suggestions"
ON public.keyword_suggestions
FOR UPDATE
USING (agency_id = get_user_agency_id(auth.uid()));

-- 3) ADD DAILY ADD COUNT TRACKING TO HIGH_INTENT_KEYWORDS
-- For rate limiting (10 adds per day per agent)
ALTER TABLE public.high_intent_keywords 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4) HELPER FUNCTION: Count agent's active keywords
CREATE OR REPLACE FUNCTION public.count_agent_active_keywords(_agent_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.high_intent_keywords
  WHERE agent_id = _agent_id
    AND scope = 'agent'
    AND active = true
    AND expires_at > now();
$$;

-- 5) HELPER FUNCTION: Count global active keywords for agency
CREATE OR REPLACE FUNCTION public.count_global_active_keywords(_agency_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.high_intent_keywords
  WHERE agency_id = _agency_id
    AND scope = 'global'
    AND active = true
    AND expires_at > now();
$$;

-- 6) HELPER FUNCTION: Count agent's keyword adds today
CREATE OR REPLACE FUNCTION public.count_agent_keyword_adds_today(_agent_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.high_intent_keywords
  WHERE created_by = _agent_id
    AND created_at >= CURRENT_DATE
    AND created_at < CURRENT_DATE + INTERVAL '1 day';
$$;

-- 7) FUNCTION: Get keyword analytics summary
CREATE OR REPLACE FUNCTION public.get_keyword_analytics(
  _agency_id uuid,
  _days integer DEFAULT 7
)
RETURNS TABLE (
  keyword_id uuid,
  keyword text,
  scope text,
  keyword_type text,
  match_count bigint,
  booked_count bigint,
  conversion_rate numeric,
  last_matched_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    k.id as keyword_id,
    k.keyword,
    k.scope,
    k.keyword_type,
    COUNT(m.id) as match_count,
    COUNT(m.booked_at) as booked_count,
    CASE 
      WHEN COUNT(m.id) > 0 THEN ROUND((COUNT(m.booked_at)::numeric / COUNT(m.id)::numeric) * 100, 1)
      ELSE 0
    END as conversion_rate,
    MAX(m.created_at) as last_matched_at
  FROM public.high_intent_keywords k
  LEFT JOIN public.keyword_match_events m ON m.keyword_id = k.id
    AND m.created_at >= now() - make_interval(days => _days)
  WHERE k.agency_id = _agency_id
  GROUP BY k.id, k.keyword, k.scope, k.keyword_type
  ORDER BY match_count DESC, k.created_at DESC;
$$;