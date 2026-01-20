
-- Backfill ai_call_summaries from phone_calls and conversations for D&L Transport
INSERT INTO public.ai_call_summaries (
  conversation_id,
  agency_id,
  external_number,
  agent_number,
  duration_secs,
  started_at,
  ended_at,
  summary,
  summary_short,
  summary_title,
  call_outcome,
  is_high_intent,
  high_intent_reasons,
  transcript,
  created_at
)
SELECT 
  COALESCE(pc.elevenlabs_call_id, pc.id::text) as conversation_id,
  pc.agency_id,
  pc.caller_phone as external_number,
  pc.receiver_phone as agent_number,
  pc.duration_seconds as duration_secs,
  pc.call_started_at as started_at,
  pc.call_ended_at as ended_at,
  c.summary,
  LEFT(c.summary, 100) as summary_short,
  CASE 
    WHEN c.outcome = 'callback_requested' THEN 'Callback Requested'
    WHEN c.outcome = 'booked' THEN 'Load Booked'
    WHEN c.outcome = 'declined' THEN 'Declined'
    ELSE 'Call Completed'
  END as summary_title,
  c.outcome as call_outcome,
  CASE 
    WHEN c.outcome IN ('callback_requested', 'booked') THEN true
    WHEN c.summary ILIKE '%MC%' OR c.summary ILIKE '%DOT%' OR c.summary ILIKE '%motor carrier%' THEN true
    ELSE false
  END as is_high_intent,
  CASE 
    WHEN c.outcome = 'callback_requested' THEN '["Callback Requested"]'::jsonb
    WHEN c.outcome = 'booked' THEN '["Load Booked"]'::jsonb
    WHEN c.summary ILIKE '%MC%' OR c.summary ILIKE '%DOT%' THEN '["Carrier ID Provided"]'::jsonb
    ELSE '[]'::jsonb
  END as high_intent_reasons,
  c.transcript,
  pc.created_at
FROM phone_calls pc
LEFT JOIN conversations c ON c.phone_call_id = pc.id
WHERE pc.agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
  AND NOT EXISTS (
    SELECT 1 FROM ai_call_summaries acs 
    WHERE acs.conversation_id = COALESCE(pc.elevenlabs_call_id, pc.id::text)
  );
