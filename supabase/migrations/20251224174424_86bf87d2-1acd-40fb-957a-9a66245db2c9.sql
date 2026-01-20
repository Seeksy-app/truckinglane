-- Drop the restrictive policies
DROP POLICY IF EXISTS "agency_members_read" ON public.agency_members;
DROP POLICY IF EXISTS "agency_members_select_own" ON public.agency_members;

-- Create a policy that allows agency members to see all members in their agency
CREATE POLICY "agency_members_view_same_agency" 
ON public.agency_members 
FOR SELECT 
USING (
  agency_id = get_user_agency_id(auth.uid())
);