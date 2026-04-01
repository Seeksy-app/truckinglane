-- Super admins (e.g. impersonating another agency) can update loads; base policy only matches their home agency_id.
CREATE POLICY "Super admins can update any load"
ON public.loads
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));
