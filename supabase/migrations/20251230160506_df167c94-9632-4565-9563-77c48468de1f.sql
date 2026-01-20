-- Add call cost column to ai_call_summaries
ALTER TABLE public.ai_call_summaries 
ADD COLUMN IF NOT EXISTS call_cost_credits integer;

-- Backfill call_cost_credits from elevenlabs_post_calls payload
UPDATE public.ai_call_summaries acs
SET call_cost_credits = (epc.payload->'data'->'metadata'->>'cost')::integer
FROM public.elevenlabs_post_calls epc
WHERE acs.external_number = (epc.payload->'data'->'metadata'->'phone_call'->>'external_number')
  AND acs.agency_id = epc.agency_id
  AND epc.payload->'data'->'metadata'->>'cost' IS NOT NULL;

-- Also update duration_secs if null (from payload)
UPDATE public.ai_call_summaries acs
SET duration_secs = COALESCE(acs.duration_secs, (epc.payload->'data'->>'call_duration_secs')::integer)
FROM public.elevenlabs_post_calls epc
WHERE acs.external_number = (epc.payload->'data'->'metadata'->'phone_call'->>'external_number')
  AND acs.agency_id = epc.agency_id
  AND epc.payload->'data'->>'call_duration_secs' IS NOT NULL;