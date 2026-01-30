-- Archive all but the 100 most recent active VMS loads to enforce retention policy
WITH keep_ids AS (
  SELECT id FROM public.loads 
  WHERE template_type = 'vms_email' AND is_active = true
  ORDER BY created_at DESC 
  LIMIT 100
)
UPDATE public.loads 
SET is_active = false, archived_at = now()
WHERE template_type = 'vms_email' 
  AND is_active = true 
  AND id NOT IN (SELECT id FROM keep_ids);