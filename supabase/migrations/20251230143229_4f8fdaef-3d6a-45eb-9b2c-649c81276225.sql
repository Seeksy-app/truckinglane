-- Update AI call summaries to DL TRANSPORT agency
UPDATE public.ai_call_summaries 
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE created_at >= CURRENT_DATE 
AND agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

-- Update leads to DL TRANSPORT agency  
UPDATE public.leads 
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE created_at >= CURRENT_DATE 
AND agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

-- Update phone_calls to DL TRANSPORT agency
UPDATE public.phone_calls 
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE created_at >= CURRENT_DATE 
AND agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';