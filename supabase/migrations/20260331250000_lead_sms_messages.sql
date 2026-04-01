-- SMS booking thread attached to leads (inbound/outbound from tl-trigger webhooks + send-sms).
CREATE TABLE public.lead_sms_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_sms_messages_lead_created ON public.lead_sms_messages(lead_id, created_at);

COMMENT ON TABLE public.lead_sms_messages IS 'SMS exchange for load booking; rows inserted by tl-trigger (service role).';

ALTER TABLE public.lead_sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view lead SMS for their leads"
ON public.lead_sms_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.agency_members am ON am.agency_id = l.agency_id
    WHERE l.id = lead_sms_messages.lead_id
    AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Super admins can view all lead SMS messages"
ON public.lead_sms_messages
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));
