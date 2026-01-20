
-- Add agency_id to elevenlabs_post_calls for proper filtering
ALTER TABLE public.elevenlabs_post_calls
ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id);

-- Create index for faster agency-based queries
CREATE INDEX IF NOT EXISTS idx_elevenlabs_post_calls_agency_id 
ON public.elevenlabs_post_calls(agency_id);

-- Backfill agency_id by matching agent_number to agency_phone_numbers
UPDATE public.elevenlabs_post_calls epc
SET agency_id = apn.agency_id
FROM public.agency_phone_numbers apn
WHERE epc.agent_number IS NOT NULL
  AND epc.agency_id IS NULL
  AND apn.phone_number = epc.agent_number;

-- For any remaining without matches, try to get from latest phone_call with same external_number
UPDATE public.elevenlabs_post_calls epc
SET agency_id = pc.agency_id
FROM public.phone_calls pc
WHERE epc.agency_id IS NULL
  AND epc.external_number IS NOT NULL
  AND pc.caller_phone = epc.external_number
  AND pc.agency_id IS NOT NULL;

-- Enable RLS on project_fingerprint to clear linter warning
ALTER TABLE public.project_fingerprint ENABLE ROW LEVEL SECURITY;

-- Allow public read on project_fingerprint (it's a utility table)
CREATE POLICY "Project fingerprint is publicly readable"
ON public.project_fingerprint FOR SELECT
TO public
USING (true);
