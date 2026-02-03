-- First, clean up VMS duplicates by keeping only unique route+rate combinations
-- Delete all VMS loads first, then we'll re-import cleanly
DELETE FROM loads 
WHERE template_type = 'vms_email' 
AND is_active = true 
AND booked_at IS NULL;