-- Move all phone calls from Seeksy Trucking to DL TRANSPORT
UPDATE phone_calls 
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

-- Delete the 2 invalid leads (just '+' phone and malformed '+224278289428')
DELETE FROM leads WHERE id IN (
  '835cc63d-0a37-4421-8541-36295344ad80',
  '1970f15b-f4bc-439b-bb52-de3491a62a43'
);