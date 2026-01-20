-- Backfill leads.notes with AI call summaries where notes are missing
UPDATE public.leads l
SET notes = CONCAT('[AI SUMMARY] ', acs.summary)
FROM public.ai_call_summaries acs
WHERE l.notes IS NULL
  AND acs.external_number = l.caller_phone
  AND acs.agency_id = l.agency_id
  AND acs.summary IS NOT NULL
  AND acs.summary != '';