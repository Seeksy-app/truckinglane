-- Add valleymetalservices.com to DL TRANSPORT's allowed sender domains for VMS imports
UPDATE agencies 
SET allowed_sender_domains = array_append(allowed_sender_domains, 'valleymetalservices.com'),
    updated_at = now()
WHERE id = '25127efb-6eef-412a-a5d0-3d8242988323';