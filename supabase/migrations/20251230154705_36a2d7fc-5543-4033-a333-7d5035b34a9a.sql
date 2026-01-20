-- Backfill all leads with complete AI call summary from ai_call_summaries
-- Match by external_number (caller_phone) and agency_id
UPDATE public.leads l
SET notes = COALESCE(
  '[AI SUMMARY] ' || acs.summary ||
  CASE WHEN acs.summary_title IS NOT NULL AND acs.summary_title != '' 
       THEN E'\n\n[TOPIC] ' || acs.summary_title 
       ELSE '' 
  END ||
  CASE WHEN acs.call_outcome IS NOT NULL AND acs.call_outcome != '' 
       THEN E'\n[OUTCOME] ' || acs.call_outcome 
       ELSE '' 
  END ||
  CASE WHEN acs.termination_reason IS NOT NULL AND acs.termination_reason != '' 
       THEN E'\n[ENDED] ' || acs.termination_reason 
       ELSE '' 
  END,
  l.notes
)
FROM public.ai_call_summaries acs
WHERE l.caller_phone = acs.external_number
  AND l.agency_id = acs.agency_id
  AND acs.summary IS NOT NULL
  AND acs.summary != '';