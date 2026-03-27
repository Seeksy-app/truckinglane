-- Allow authenticated agency members to insert activity log rows (e.g. DAT CSV export from the app)
CREATE POLICY "Agency members can insert email import logs for their agency"
ON public.email_import_logs
FOR INSERT
TO authenticated
WITH CHECK (
  agency_id IS NOT NULL
  AND (
    agency_id IN (SELECT agency_id FROM public.agency_members WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.agency_members
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);
