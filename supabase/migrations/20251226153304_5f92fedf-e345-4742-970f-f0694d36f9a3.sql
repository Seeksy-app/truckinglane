-- Allow agency members to view profiles of users in their agency
CREATE POLICY "Agency members can view team profiles"
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT user_id FROM agency_members 
    WHERE agency_id = get_user_agency_id(auth.uid())
  )
);