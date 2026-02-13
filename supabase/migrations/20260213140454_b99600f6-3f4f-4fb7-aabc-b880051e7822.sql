-- Archive all VMS loads that were NOT part of today's import
-- Today's import created loads at 2026-02-13 13:42:20 (the latest batch)
-- Keep only loads from the most recent import batch
UPDATE loads
SET is_active = false, archived_at = now()
WHERE template_type = 'vms_email'
  AND is_active = true
  AND status != 'booked'
  AND created_at::date < '2026-02-13';