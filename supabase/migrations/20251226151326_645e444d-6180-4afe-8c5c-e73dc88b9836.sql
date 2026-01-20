
-- Backfill ai_call_summaries from elevenlabs_post_calls for all agencies
-- Use D&L Transport agency_id as default since that's the main agency using the system
INSERT INTO public.ai_call_summaries (
  conversation_id,
  agency_id,
  external_number,
  agent_number,
  duration_secs,
  summary,
  summary_short,
  summary_title,
  call_outcome,
  is_high_intent,
  high_intent_reasons,
  termination_reason,
  created_at
)
SELECT 
  COALESCE(e.payload->>'conversation_id', e.payload->'data'->>'conversation_id', e.id::text) as conversation_id,
  '25127efb-6eef-412a-a5d0-3d8242988323'::uuid as agency_id,
  COALESCE(
    e.external_number,
    e.payload->'metadata'->'phone_call'->>'from_number',
    e.payload->'data'->'metadata'->'phone_call'->>'from_number'
  ) as external_number,
  COALESCE(
    e.agent_number,
    e.payload->'metadata'->'phone_call'->>'to_number',
    e.payload->'data'->'metadata'->'phone_call'->>'to_number'
  ) as agent_number,
  e.call_duration_secs as duration_secs,
  e.transcript_summary as summary,
  LEFT(e.transcript_summary, 100) as summary_short,
  e.call_summary_title as summary_title,
  CASE 
    WHEN e.call_summary_title ILIKE '%callback%' OR e.transcript_summary ILIKE '%callback%' THEN 'callback_requested'
    WHEN e.call_summary_title ILIKE '%book%' OR e.transcript_summary ILIKE '%booked%' THEN 'booked'
    WHEN e.call_summary_title ILIKE '%declin%' OR e.transcript_summary ILIKE '%declin%' THEN 'declined'
    WHEN e.call_summary_title ILIKE '%dispatch%' OR e.transcript_summary ILIKE '%dispatch%' THEN 'callback_requested'
    ELSE 'completed'
  END as call_outcome,
  CASE 
    WHEN e.call_summary_title ILIKE '%dispatch%' OR e.transcript_summary ILIKE '%dispatch%' THEN true
    WHEN e.call_summary_title ILIKE '%callback%' OR e.transcript_summary ILIKE '%callback%' THEN true
    WHEN e.call_summary_title ILIKE '%book%' OR e.transcript_summary ILIKE '%booked%' THEN true
    WHEN e.transcript_summary ILIKE '%MC%' OR e.transcript_summary ILIKE '%DOT%' THEN true
    ELSE false
  END as is_high_intent,
  CASE 
    WHEN e.call_summary_title ILIKE '%dispatch%' OR e.transcript_summary ILIKE '%dispatch%' THEN '["Dispatch Requested"]'::jsonb
    WHEN e.call_summary_title ILIKE '%callback%' OR e.transcript_summary ILIKE '%callback%' THEN '["Callback Requested"]'::jsonb
    WHEN e.call_summary_title ILIKE '%book%' THEN '["Load Booked"]'::jsonb
    WHEN e.transcript_summary ILIKE '%MC%' OR e.transcript_summary ILIKE '%DOT%' THEN '["Carrier ID Provided"]'::jsonb
    ELSE '[]'::jsonb
  END as high_intent_reasons,
  e.termination_reason,
  e.created_at
FROM elevenlabs_post_calls e
WHERE e.transcript_summary IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ai_call_summaries acs 
    WHERE acs.conversation_id = COALESCE(e.payload->>'conversation_id', e.payload->'data'->>'conversation_id', e.id::text)
  );
