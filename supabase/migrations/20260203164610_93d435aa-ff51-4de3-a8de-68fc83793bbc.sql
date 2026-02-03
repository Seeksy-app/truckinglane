-- Clean up ALL VMS loads to reset and let next import create fresh data
DELETE FROM loads 
WHERE template_type = 'vms_email' 
AND is_active = true 
AND booked_at IS NULL;