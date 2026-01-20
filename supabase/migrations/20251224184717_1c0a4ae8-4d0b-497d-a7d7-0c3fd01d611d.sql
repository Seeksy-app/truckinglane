-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "agency_members_view_agency_colleagues" ON public.agency_members;

-- Create a security definer function to get user's agency_id without RLS
CREATE OR REPLACE FUNCTION public.get_user_agency_id_secure(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT agency_id 
  FROM public.agency_members 
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create a safe policy using the security definer function
CREATE POLICY "agency_members_view_agency_colleagues_safe" 
ON public.agency_members 
FOR SELECT 
USING (
  agency_id = public.get_user_agency_id_secure(auth.uid())
);