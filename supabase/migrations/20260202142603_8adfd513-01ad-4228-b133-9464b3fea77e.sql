-- Delete all VMS loads (both active and archived)
DELETE FROM loads WHERE template_type = 'vms_email';