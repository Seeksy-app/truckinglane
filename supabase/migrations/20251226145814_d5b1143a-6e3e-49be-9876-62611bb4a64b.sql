-- Allow super admins to view all loads (for impersonation)
CREATE POLICY "Super admins can view all loads"
ON public.loads
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super admins to manage all loads (for impersonation)
CREATE POLICY "Super admins can manage all loads"
ON public.loads
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));