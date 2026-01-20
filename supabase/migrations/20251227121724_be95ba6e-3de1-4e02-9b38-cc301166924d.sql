-- Add timezone column to profiles table with default
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.timezone IS 'IANA timezone identifier for date calculations (e.g., America/New_York)';