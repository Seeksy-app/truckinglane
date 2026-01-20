
-- Add DL TRANSPORT's official phone number
INSERT INTO public.agency_phone_numbers (agency_id, phone_number, label, is_active)
VALUES ('25127efb-6eef-412a-a5d0-3d8242988323', '+18887857499', 'Main Line', true)
ON CONFLICT DO NOTHING;
