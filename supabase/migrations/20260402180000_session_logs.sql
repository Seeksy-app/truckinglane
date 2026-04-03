-- Broker session activity log (dashboard widget + admin session logs page).

CREATE TABLE public.session_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_display_name text,
  action text NOT NULL,
  note text,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_logs_agency_created ON public.session_logs (agency_id, created_at DESC);

COMMENT ON TABLE public.session_logs IS 'User session / activity entries per agency for admin visibility.';

ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read session_logs for their agency"
  ON public.session_logs
  FOR SELECT
  TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM public.agency_members WHERE user_id = auth.uid()
    )
  );

-- Inserts expected from service role / future app instrumentation; optional admin insert:
CREATE POLICY "Agency admins can insert session_logs for their agency"
  ON public.session_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM public.agency_members
      WHERE user_id = auth.uid() AND role IN ('agency_admin', 'super_admin')
    )
  );
