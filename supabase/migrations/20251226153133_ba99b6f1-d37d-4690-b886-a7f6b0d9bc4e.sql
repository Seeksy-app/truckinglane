-- Allow agency admins and super admins to view all members in their agency
CREATE POLICY "Admins can view agency members"
ON public.agency_members
FOR SELECT
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);