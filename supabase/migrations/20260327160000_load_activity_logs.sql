-- Canonical import events for dashboard "NEW" loads (per agency, per sync batch).

CREATE TABLE public.load_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_load_activity_logs_agency_action_created
  ON public.load_activity_logs (agency_id, action, created_at DESC);

COMMENT ON TABLE public.load_activity_logs IS 'Auditable events; action=import marks a load import/sync completion for KPI NEW loads.';

ALTER TABLE public.load_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read load activity for their agency"
  ON public.load_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM public.agency_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.agency_members m
      WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
    )
  );

-- Service role / edge functions insert via service role (bypass RLS).

-- Backfill import events from existing email import audit trail (exclude DAT exports and nightly archive).
INSERT INTO public.load_activity_logs (agency_id, action, created_at, meta)
SELECT
  e.agency_id,
  'import',
  e.created_at,
  jsonb_build_object('source', 'email_import_logs', 'email_import_log_id', e.id)
FROM public.email_import_logs e
WHERE e.agency_id IS NOT NULL
  AND e.status IN ('success', 'partial')
  AND lower(e.sender_email) NOT LIKE 'dat-%'
  AND lower(e.sender_email) NOT LIKE '%daily-archive%';

-- New email import rows also emit load_activity_logs (import action).
CREATE OR REPLACE FUNCTION public.emit_load_activity_from_email_import()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NULL OR NEW.status NOT IN ('success', 'partial') THEN
    RETURN NEW;
  END IF;
  IF lower(NEW.sender_email) LIKE 'dat-%' OR lower(NEW.sender_email) LIKE '%daily-archive%' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.load_activity_logs (agency_id, action, created_at, meta)
  VALUES (
    NEW.agency_id,
    'import',
    NEW.created_at,
    jsonb_build_object('email_import_log_id', NEW.id, 'sender_email', NEW.sender_email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER email_import_logs_emit_load_activity
  AFTER INSERT ON public.email_import_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_load_activity_from_email_import();
