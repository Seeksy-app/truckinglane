-- Add new fields to leads table for resolve workflow
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS close_reason text,
ADD COLUMN IF NOT EXISTS callback_requested_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_contact_attempt_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone;

-- Create lead_events audit table
CREATE TABLE IF NOT EXISTS public.lead_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id),
  event_type text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add index for querying events by lead
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id ON public.lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at ON public.lead_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_events_event_type ON public.lead_events(event_type);

-- Enable RLS on lead_events
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for lead_events
CREATE POLICY "Agency members can view their lead events"
ON public.lead_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM leads l
    JOIN agency_members am ON am.agency_id = l.agency_id
    WHERE l.id = lead_events.lead_id
    AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Agency members can insert lead events"
ON public.lead_events
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM leads l
    JOIN agency_members am ON am.agency_id = l.agency_id
    WHERE l.id = lead_events.lead_id
    AND am.user_id = auth.uid()
  )
);

-- Add comment for documentation
COMMENT ON TABLE public.lead_events IS 'Audit log for lead resolution actions';