
-- Create leads from high-intent AI calls that don't have leads yet
INSERT INTO public.leads (
  agency_id,
  caller_phone,
  caller_name,
  is_high_intent,
  intent_score,
  notes,
  status,
  callback_requested_at,
  created_at
)
SELECT 
  acs.agency_id,
  acs.external_number as caller_phone,
  CASE 
    WHEN acs.summary ILIKE '%my name is%' THEN 
      SUBSTRING(acs.summary FROM 'my name is ([A-Za-z]+)')
    ELSE NULL
  END as caller_name,
  true as is_high_intent,
  8 as intent_score,
  acs.summary as notes,
  'pending'::lead_status as status,
  acs.created_at as callback_requested_at,
  acs.created_at
FROM ai_call_summaries acs
WHERE acs.agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
  AND acs.is_high_intent = true
  AND acs.external_number IS NOT NULL
  AND acs.external_number NOT IN ('+10000000000', '+', '')
  AND NOT EXISTS (
    SELECT 1 FROM leads l 
    WHERE l.caller_phone = acs.external_number 
      AND l.agency_id = acs.agency_id
      AND l.created_at::date = acs.created_at::date
  );
