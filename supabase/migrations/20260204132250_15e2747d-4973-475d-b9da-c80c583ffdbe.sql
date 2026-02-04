-- Archive all active non-booked loads now
UPDATE loads
SET is_active = false,
    archived_at = now()
WHERE is_active = true
  AND status != 'booked';