-- Dashboard SMS booking review: who handled + when; driver notify flow.
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS booked_handled_at timestamptz,
  ADD COLUMN IF NOT EXISTS booked_handled_by uuid REFERENCES auth.users (id);

CREATE INDEX IF NOT EXISTS idx_loads_pending_sms_booking
  ON public.loads (agency_id, updated_at DESC)
  WHERE sms_book_status = 'pending_review' AND booked_handled_at IS NULL;

-- Allow agency users (and super admins) to insert audit rows from the dashboard.
CREATE POLICY "Agency members can insert load activity for their agency"
  ON public.load_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
