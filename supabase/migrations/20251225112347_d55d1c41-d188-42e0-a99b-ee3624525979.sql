-- Enable RLS on elevenlabs_post_calls
ALTER TABLE public.elevenlabs_post_calls ENABLE ROW LEVEL SECURITY;

-- Allow super_admins to read all elevenlabs_post_calls
CREATE POLICY "Super admins view elevenlabs_post_calls"
ON public.elevenlabs_post_calls
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super_admins full access
CREATE POLICY "Super admins manage elevenlabs_post_calls"
ON public.elevenlabs_post_calls
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));