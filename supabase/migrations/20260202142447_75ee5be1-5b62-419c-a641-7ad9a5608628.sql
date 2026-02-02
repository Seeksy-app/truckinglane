-- Clean up the duplicate active VMS loads - keep only the most recent batch
-- First, identify the most recent import batch by looking at created_at timestamps

-- Archive all VMS loads except the most recent ~100
WITH recent_vms AS (
  SELECT id 
  FROM loads 
  WHERE template_type = 'vms_email' 
    AND is_active = true 
  ORDER BY created_at DESC 
  LIMIT 100
)
UPDATE loads 
SET is_active = false, 
    archived_at = now() 
WHERE template_type = 'vms_email' 
  AND is_active = true 
  AND id NOT IN (SELECT id FROM recent_vms);

-- Verify counts after cleanup
SELECT template_type, is_active, COUNT(*) 
FROM loads 
WHERE template_type IN ('vms_email', 'adelphia_xlsx')
GROUP BY template_type, is_active 
ORDER BY template_type, is_active DESC;