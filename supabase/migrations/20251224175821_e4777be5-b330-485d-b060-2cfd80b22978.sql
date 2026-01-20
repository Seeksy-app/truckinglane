-- Drop the problematic policy
DROP POLICY IF EXISTS "agency_members_view_same_agency" ON public.agency_members;

-- Create a policy that allows users to see their own membership row first
-- This breaks the circular dependency
CREATE POLICY "agency_members_view_own_row" 
ON public.agency_members 
FOR SELECT 
USING (user_id = auth.uid());

-- Create a separate policy for viewing other members in the same agency
-- This uses a subquery approach that's safer
CREATE POLICY "agency_members_view_agency_colleagues" 
ON public.agency_members 
FOR SELECT 
USING (
  agency_id IN (
    SELECT am.agency_id 
    FROM public.agency_members am 
    WHERE am.user_id = auth.uid()
  )
);