
-- Create a private storage bucket for load imports
INSERT INTO storage.buckets (id, name, public)
VALUES ('load-imports', 'load-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Allow service role to manage files (edge functions use service role)
-- No public RLS policies needed since only edge functions access this bucket
CREATE POLICY "Service role full access on load-imports"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'load-imports')
WITH CHECK (bucket_id = 'load-imports');
