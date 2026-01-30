-- Archive excess VMS loads (keep only latest 100)
WITH to_archive AS (
  SELECT id
  FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY agency_id ORDER BY created_at DESC) as rn
    FROM loads 
    WHERE template_type = 'vms_email' AND is_active = true
  ) ranked
  WHERE rn > 100
)
UPDATE loads 
SET is_active = false, archived_at = now()
WHERE id IN (SELECT id FROM to_archive);

-- Also archive old Aljex loads from before today
UPDATE loads 
SET is_active = false, archived_at = now()
WHERE template_type = 'aljex_flat' 
  AND is_active = true 
  AND status = 'open'
  AND board_date < CURRENT_DATE;