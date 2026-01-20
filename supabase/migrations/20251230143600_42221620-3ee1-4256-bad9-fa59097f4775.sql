-- Update ai_call_summaries with correct phone numbers from elevenlabs_post_calls payload
UPDATE public.ai_call_summaries acs
SET external_number = COALESCE(
  epc.payload->'metadata'->'phone_call'->>'external_number',
  acs.external_number
)
FROM public.elevenlabs_post_calls epc
WHERE acs.conversation_id = epc.conversation_id
AND acs.external_number = 'unknown'
AND epc.payload->'metadata'->'phone_call'->>'external_number' IS NOT NULL;

-- Create leads for all AI calls today that have valid phone numbers but no lead yet
INSERT INTO public.leads (
  agency_id,
  caller_phone,
  status,
  is_high_intent,
  conversation_id,
  created_at
)
SELECT DISTINCT ON (epc.payload->'metadata'->'phone_call'->>'external_number')
  '25127efb-6eef-412a-a5d0-3d8242988323'::uuid as agency_id,
  epc.payload->'metadata'->'phone_call'->>'external_number' as caller_phone,
  'pending'::lead_status as status,
  COALESCE(acs.is_high_intent, false) as is_high_intent,
  (SELECT c.id FROM public.conversations c 
   JOIN public.phone_calls pc ON c.phone_call_id = pc.id 
   WHERE pc.caller_phone = epc.payload->'metadata'->'phone_call'->>'external_number'
   LIMIT 1) as conversation_id,
  epc.created_at
FROM public.elevenlabs_post_calls epc
LEFT JOIN public.ai_call_summaries acs ON acs.conversation_id = epc.conversation_id
WHERE epc.created_at >= CURRENT_DATE
AND epc.payload->'metadata'->'phone_call'->>'external_number' IS NOT NULL
AND epc.payload->'metadata'->'phone_call'->>'external_number' != ''
AND NOT EXISTS (
  SELECT 1 FROM public.leads l 
  WHERE l.caller_phone = epc.payload->'metadata'->'phone_call'->>'external_number'
  AND l.created_at >= CURRENT_DATE
)
ORDER BY epc.payload->'metadata'->'phone_call'->>'external_number', epc.created_at DESC;