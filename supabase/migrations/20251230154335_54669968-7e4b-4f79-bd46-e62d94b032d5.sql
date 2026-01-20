-- Fix recent leads and ai_call_summaries that were assigned to wrong agency
-- Update leads created today that match D&L Transport's phone numbers
UPDATE public.leads l
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
WHERE l.created_at > '2025-12-30 15:00:00+00'
  AND l.agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

-- Update ai_call_summaries created today  
UPDATE public.ai_call_summaries
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
WHERE created_at > '2025-12-30 15:00:00+00'
  AND agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

-- Update phone_calls created today
UPDATE public.phone_calls
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
WHERE created_at > '2025-12-30 15:00:00+00'
  AND agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';