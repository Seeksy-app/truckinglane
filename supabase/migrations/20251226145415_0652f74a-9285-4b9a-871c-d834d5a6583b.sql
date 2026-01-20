-- Move all loads from Seeksy Trucking to DL TRANSPORT
UPDATE loads 
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323' 
WHERE agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';