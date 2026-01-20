-- Allow super admins to view all leads (for impersonation)
CREATE POLICY "Super admins can view all leads"
ON public.leads
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super admins to manage all leads (for impersonation)
CREATE POLICY "Super admins can manage all leads"
ON public.leads
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));