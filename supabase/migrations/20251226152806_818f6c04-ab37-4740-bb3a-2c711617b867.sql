-- Move remaining ai_call_summaries
UPDATE ai_call_summaries SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

-- Move Andrew's super_admin to D&L
UPDATE agency_members 
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
WHERE user_id = '5e3d8a8e-9ff1-4284-806c-4905db15fd98' 
AND agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';