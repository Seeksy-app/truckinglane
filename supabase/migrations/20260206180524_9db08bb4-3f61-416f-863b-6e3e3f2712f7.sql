-- Add account_type column to agencies table
ALTER TABLE public.agencies 
ADD COLUMN account_type text NOT NULL DEFAULT 'agency' 
CHECK (account_type IN ('agency', 'broker'));