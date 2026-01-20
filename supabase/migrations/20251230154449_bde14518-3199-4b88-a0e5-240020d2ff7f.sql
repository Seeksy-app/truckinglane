-- Fix the 2 remaining leads assigned to wrong agency
UPDATE public.leads
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567'
  AND created_at > '2025-12-30 14:00:00+00';

-- Also fix the ai_call_summaries for those calls
UPDATE public.ai_call_summaries
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567'
  AND created_at > '2025-12-30 14:00:00+00';