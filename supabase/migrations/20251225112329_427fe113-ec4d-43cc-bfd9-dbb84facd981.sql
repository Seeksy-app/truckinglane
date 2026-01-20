-- Update appletonab@gmail.com to super_admin role
UPDATE public.agency_members 
SET role = 'super_admin'
WHERE user_id = '5e3d8a8e-9ff1-4284-806c-4905db15fd98';