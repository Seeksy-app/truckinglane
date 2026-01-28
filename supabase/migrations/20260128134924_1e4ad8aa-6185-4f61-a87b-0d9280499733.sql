-- First clear Seeksy Trucking's code
UPDATE agencies 
SET import_email_code = NULL
WHERE id = 'e15abb7c-e759-40ae-ac86-4a38fd0e6567';

-- Then set DL TRANSPORT with ADELPHIA code
UPDATE agencies 
SET import_email_code = 'ADELPHIA',
    allowed_sender_domains = ARRAY['adelphia.com']
WHERE id = '25127efb-6eef-412a-a5d0-3d8242988323';