-- Add main contact fields to agencies table
ALTER TABLE public.agencies 
ADD COLUMN main_contact_name text,
ADD COLUMN main_contact_email text;