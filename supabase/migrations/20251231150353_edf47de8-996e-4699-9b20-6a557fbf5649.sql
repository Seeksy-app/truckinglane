-- Fix leads that were assigned to the wrong agency
-- These leads should be assigned to DL TRANSPORT (25127efb-6eef-412a-a5d0-3d8242988323) based on phone number +18887857499
UPDATE leads 
SET agency_id = '25127efb-6eef-412a-a5d0-3d8242988323'
WHERE id IN ('757e8eef-dc24-4305-b3ba-ad87a8cfc367', 'd38b8bda-dd17-4ddc-9c97-31dac997a349')
  AND agency_id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';