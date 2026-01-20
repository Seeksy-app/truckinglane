-- Create system_health_events table for monitoring service health
CREATE TABLE public.system_health_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'warn', 'fail')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups by service and time
CREATE INDEX idx_health_events_service_time ON public.system_health_events (service_name, created_at DESC);
CREATE INDEX idx_health_events_status ON public.system_health_events (status, created_at DESC);

-- Enable RLS
ALTER TABLE public.system_health_events ENABLE ROW LEVEL SECURITY;

-- Super admins can view all health events
CREATE POLICY "Super admins can view health events"
  ON public.system_health_events
  FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow service role (edge functions) to insert health events
CREATE POLICY "Service role can insert health events"
  ON public.system_health_events
  FOR INSERT
  WITH CHECK (true);

-- Create alert_state table to track last known state for de-duplication
CREATE TABLE public.system_alert_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL UNIQUE,
  last_status TEXT NOT NULL DEFAULT 'ok',
  last_alerted_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_alert_state ENABLE ROW LEVEL SECURITY;

-- Super admins can view alert state
CREATE POLICY "Super admins can view alert state"
  ON public.system_alert_state
  FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Service role can manage alert state
CREATE POLICY "Service role can manage alert state"
  ON public.system_alert_state
  FOR ALL
  WITH CHECK (true);