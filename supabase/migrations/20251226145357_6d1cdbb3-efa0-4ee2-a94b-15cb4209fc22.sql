-- Move all loads from Seeksy Trucking to DL TRANSPORT for testing
UPDATE loads 
SET agency_id = '25127efb-1f32-45c5-bca7-f2e8af49abfb' 
WHERE agency_id = 'e15abb7c-7c2e-451b-8836-c29ff6a3e38c';