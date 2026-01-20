-- Create agent_daily_stats table for persisting AEI and component metrics
CREATE TABLE public.agent_daily_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  stat_date date NOT NULL DEFAULT CURRENT_DATE,
  ai_minutes_saved numeric NOT NULL DEFAULT 0,
  high_intent_calls integer NOT NULL DEFAULT 0,
  total_calls integer NOT NULL DEFAULT 0,
  avg_callback_seconds numeric NOT NULL DEFAULT 0,
  aei_score numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, stat_date)
);

-- Add mc column to carrier_intelligence for MC number storage
ALTER TABLE public.carrier_intelligence 
ADD COLUMN IF NOT EXISTS mc text,
ADD COLUMN IF NOT EXISTS out_of_service_flag boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_verified_at timestamp with time zone;

-- Enable RLS on agent_daily_stats
ALTER TABLE public.agent_daily_stats ENABLE ROW LEVEL SECURITY;

-- Users can view their own stats
CREATE POLICY "Users can view their own stats"
ON public.agent_daily_stats FOR SELECT
USING (user_id = auth.uid());

-- Users can insert their own stats
CREATE POLICY "Users can insert their own stats"
ON public.agent_daily_stats FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own stats
CREATE POLICY "Users can update their own stats"
ON public.agent_daily_stats FOR UPDATE
USING (user_id = auth.uid());

-- Agency admins can view all agency stats (for ROI view)
CREATE POLICY "Agency admins can view agency stats"
ON public.agent_daily_stats FOR SELECT
USING (
  agency_id = get_user_agency_id(auth.uid()) 
  AND has_role(auth.uid(), 'agency_admin'::app_role)
);

-- Create trigger for updated_at
CREATE TRIGGER update_agent_daily_stats_updated_at
BEFORE UPDATE ON public.agent_daily_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient lookups
CREATE INDEX idx_agent_daily_stats_user_date ON public.agent_daily_stats(user_id, stat_date DESC);
CREATE INDEX idx_agent_daily_stats_agency_date ON public.agent_daily_stats(agency_id, stat_date DESC);