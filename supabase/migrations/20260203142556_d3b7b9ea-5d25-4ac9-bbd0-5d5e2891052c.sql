-- Clean up duplicate/excess loads safely
-- First, null out load_id references in leads table for loads that will be deleted

-- Update leads to null out load_id for archived loads 
UPDATE leads 
SET load_id = NULL 
WHERE load_id IN (
  SELECT id FROM loads 
  WHERE is_active = false
);

-- Update leads to null out load_id for old active loads from previous days
UPDATE leads 
SET load_id = NULL 
WHERE load_id IN (
  SELECT id FROM loads 
  WHERE is_active = true 
  AND DATE(created_at) < CURRENT_DATE
  AND template_type IN ('vms_email', 'adelphia_xlsx', 'aljex_flat')
);

-- Now safely delete archived loads
DELETE FROM loads WHERE is_active = false;

-- Archive and delete old active loads (keep only today's)
UPDATE loads 
SET is_active = false, archived_at = now()
WHERE is_active = true 
  AND DATE(created_at) < CURRENT_DATE
  AND template_type IN ('vms_email', 'adelphia_xlsx', 'aljex_flat');

DELETE FROM loads WHERE is_active = false;