-- Backfill leads with the FULL ElevenLabs summary from elevenlabs_post_calls raw payloads
-- Extract transcript_summary from data.analysis.transcript_summary in the payload

UPDATE public.leads l
SET notes = COALESCE(
  '[AI SUMMARY] ' || (epc.payload->'data'->'analysis'->>'transcript_summary') ||
  CASE WHEN epc.payload->'data'->'analysis'->>'call_summary_title' IS NOT NULL 
       THEN E'\n\n[TOPIC] ' || (epc.payload->'data'->'analysis'->>'call_summary_title')
       ELSE '' 
  END ||
  CASE WHEN epc.payload->'data'->'analysis'->>'call_successful' IS NOT NULL 
       THEN E'\n[STATUS] ' || (epc.payload->'data'->'analysis'->>'call_successful')
       ELSE '' 
  END ||
  CASE WHEN epc.payload->'data'->>'termination_reason' IS NOT NULL 
       THEN E'\n[ENDED] ' || (epc.payload->'data'->>'termination_reason')
       ELSE '' 
  END,
  l.notes
)
FROM public.elevenlabs_post_calls epc
WHERE l.caller_phone = (epc.payload->'data'->'metadata'->'phone_call'->>'external_number')
  AND epc.payload->'data'->'analysis'->>'transcript_summary' IS NOT NULL
  AND epc.payload->'data'->'analysis'->>'transcript_summary' != '';

-- Also update ai_call_summaries with the full summary
UPDATE public.ai_call_summaries acs
SET 
  summary = COALESCE(epc.payload->'data'->'analysis'->>'transcript_summary', acs.summary),
  summary_title = COALESCE(epc.payload->'data'->'analysis'->>'call_summary_title', acs.summary_title),
  termination_reason = COALESCE(epc.payload->'data'->>'termination_reason', acs.termination_reason)
FROM public.elevenlabs_post_calls epc
WHERE acs.external_number = (epc.payload->'data'->'metadata'->'phone_call'->>'external_number')
  AND epc.payload->'data'->'analysis'->>'transcript_summary' IS NOT NULL;