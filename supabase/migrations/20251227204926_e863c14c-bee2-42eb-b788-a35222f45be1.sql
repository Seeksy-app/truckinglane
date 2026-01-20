-- Create agent_daily_state table to track per-agent, per-day dashboard state
CREATE TABLE public.agent_daily_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  local_date date NOT NULL DEFAULT CURRENT_DATE,
  timezone text NOT NULL DEFAULT 'America/New_York',
  
  -- KPI counters
  ai_minutes numeric NOT NULL DEFAULT 0,
  high_intent integer NOT NULL DEFAULT 0,
  callback_speed_seconds numeric NOT NULL DEFAULT 0,
  aei_score numeric NOT NULL DEFAULT 0,
  ai_calls integer NOT NULL DEFAULT 0,
  booked integer NOT NULL DEFAULT 0,
  
  -- Today view lists (IDs only, not full data)
  leads_today_ids uuid[] NOT NULL DEFAULT '{}',
  open_loads_today_ids uuid[] NOT NULL DEFAULT '{}',
  recent_calls_today_ids uuid[] NOT NULL DEFAULT '{}',
  engaged_calls_today_ids uuid[] NOT NULL DEFAULT '{}',
  quick_hangups_today_ids uuid[] NOT NULL DEFAULT '{}',
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  reset_at timestamp with time zone,
  
  -- Unique constraint for agent + date
  CONSTRAINT agent_daily_state_agent_date_unique UNIQUE (agent_id, local_date)
);

-- Create index for fast lookups
CREATE INDEX idx_agent_daily_state_agent_date ON public.agent_daily_state(agent_id, local_date);
CREATE INDEX idx_agent_daily_state_agency_date ON public.agent_daily_state(agency_id, local_date);

-- Enable RLS
ALTER TABLE public.agent_daily_state ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own daily state"
  ON public.agent_daily_state
  FOR SELECT
  USING (agent_id = auth.uid());

CREATE POLICY "Users can insert their own daily state"
  ON public.agent_daily_state
  FOR INSERT
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Users can update their own daily state"
  ON public.agent_daily_state
  FOR UPDATE
  USING (agent_id = auth.uid());

CREATE POLICY "Agency admins can view agency daily states"
  ON public.agent_daily_state
  FOR SELECT
  USING (
    agency_id = get_user_agency_id(auth.uid()) 
    AND has_role(auth.uid(), 'agency_admin'::app_role)
  );

CREATE POLICY "Super admins can manage all daily states"
  ON public.agent_daily_state
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_agent_daily_state_updated_at
  BEFORE UPDATE ON public.agent_daily_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to reset daily state for an agent (called by cron job)
CREATE OR REPLACE FUNCTION public.reset_agent_daily_state(
  _agent_id uuid,
  _agency_id uuid,
  _timezone text DEFAULT 'America/New_York'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _local_date date;
BEGIN
  -- Calculate local date in agent's timezone
  _local_date := (now() AT TIME ZONE _timezone)::date;
  
  -- Upsert the daily state with zeroed values
  INSERT INTO public.agent_daily_state (
    agent_id, agency_id, local_date, timezone,
    ai_minutes, high_intent, callback_speed_seconds, aei_score, ai_calls, booked,
    leads_today_ids, open_loads_today_ids, recent_calls_today_ids,
    engaged_calls_today_ids, quick_hangups_today_ids, reset_at
  )
  VALUES (
    _agent_id, _agency_id, _local_date, _timezone,
    0, 0, 0, 0, 0, 0,
    '{}', '{}', '{}', '{}', '{}', now()
  )
  ON CONFLICT (agent_id, local_date)
  DO UPDATE SET
    ai_minutes = 0,
    high_intent = 0,
    callback_speed_seconds = 0,
    aei_score = 0,
    ai_calls = 0,
    booked = 0,
    leads_today_ids = '{}',
    open_loads_today_ids = '{}',
    recent_calls_today_ids = '{}',
    engaged_calls_today_ids = '{}',
    quick_hangups_today_ids = '{}',
    reset_at = now(),
    updated_at = now();
END;
$$;