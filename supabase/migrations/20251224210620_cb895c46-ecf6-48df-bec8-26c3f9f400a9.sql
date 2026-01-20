-- First, let's check if the issue is with the SECURITY DEFINER function
-- Drop existing policies and recreate with a simpler approach
DROP POLICY IF EXISTS "agency_members_view_own_row" ON public.agency_members;
DROP POLICY IF EXISTS "agency_members_view_agency_colleagues_safe" ON public.agency_members;

-- Create a simple policy that allows users to view their own row
-- This is the minimum needed for useUserRole to work
CREATE POLICY "agency_members_select_own" 
ON public.agency_members 
FOR SELECT 
USING (user_id = auth.uid());

-- Create a separate policy for viewing colleagues (agency admins/super admins)
-- using EXISTS instead of a function call
CREATE POLICY "agency_members_select_colleagues" 
ON public.agency_members 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members my_membership
    WHERE my_membership.user_id = auth.uid()
    AND my_membership.agency_id = agency_members.agency_id
  )
);