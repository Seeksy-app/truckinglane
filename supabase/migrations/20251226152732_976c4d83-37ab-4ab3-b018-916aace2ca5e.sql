-- Step 1: Move all data from Seeksy to D&L
UPDATE ai_call_summaries SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE elevenlabs_post_calls SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE phone_calls SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE leads SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE loads SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE carrier_intelligence SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE high_intent_keywords SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE accounts SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE agency_phone_numbers SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE keyword_match_events SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE keyword_suggestions SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE agent_daily_stats SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE prospecting_queue SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

UPDATE load_import_runs SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';