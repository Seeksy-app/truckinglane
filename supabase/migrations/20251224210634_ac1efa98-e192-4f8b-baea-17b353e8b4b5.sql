-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "agency_members_select_colleagues" ON public.agency_members;

-- The "agency_members_select_own" policy is sufficient for useUserRole
-- Users can see their own membership, which is all that's needed for role checking
-- For viewing colleagues, we'll use the SECURITY DEFINER function approach