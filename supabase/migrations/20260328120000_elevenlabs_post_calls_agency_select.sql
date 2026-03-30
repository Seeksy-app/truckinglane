-- Allow agency members to read elevenlabs_post_calls for their agency (dashboard + lead detail).
CREATE POLICY "Agency members view own elevenlabs_post_calls"
ON public.elevenlabs_post_calls
FOR SELECT
TO authenticated
USING (
  agency_id IS NOT NULL
  AND agency_id = get_user_agency_id(auth.uid())
);
