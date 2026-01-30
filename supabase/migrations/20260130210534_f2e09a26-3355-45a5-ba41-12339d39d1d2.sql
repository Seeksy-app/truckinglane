-- Archive all VMS loads except the most recent import batch (by board_date)
-- Keep only loads from the latest board_date
WITH latest_board AS (
  SELECT MAX(board_date) as max_date 
  FROM public.loads 
  WHERE template_type = 'vms_email' AND is_active = true
)
UPDATE public.loads 
SET is_active = false, archived_at = now()
WHERE template_type = 'vms_email' 
  AND is_active = true 
  AND booked_at IS NULL
  AND board_date < (SELECT max_date FROM latest_board);