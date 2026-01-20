-- Add Andrew Appleton as agency_admin to Seeksy Trucking
INSERT INTO public.agency_members (user_id, agency_id, role)
VALUES (
  '5e3d8a8e-9ff1-4284-806c-4905db15fd98',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  'agency_admin'
)
ON CONFLICT (user_id, agency_id) DO UPDATE SET role = 'agency_admin';