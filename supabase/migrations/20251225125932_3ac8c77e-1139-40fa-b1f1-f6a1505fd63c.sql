-- Add claimed_by and claimed_at columns to loads table
ALTER TABLE public.loads 
ADD COLUMN claimed_by uuid REFERENCES public.profiles(id),
ADD COLUMN claimed_at timestamp with time zone;

-- Create index for claimed_by lookups
CREATE INDEX idx_loads_claimed_by ON public.loads(claimed_by);

-- Create trigger function to enforce load status rules (similar to leads)
CREATE OR REPLACE FUNCTION public.enforce_load_status_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- claim: open -> claimed
  IF OLD.status = 'open' AND NEW.status = 'claimed' THEN
    IF NEW.claimed_by IS NULL THEN
      RAISE EXCEPTION 'claimed_by required when claiming';
    END IF;
    IF NEW.claimed_at IS NULL THEN
      NEW.claimed_at := now();
    END IF;
  END IF;

  -- book: claimed -> booked
  IF OLD.status = 'claimed' AND NEW.status = 'booked' THEN
    IF NEW.booked_by IS NULL THEN
      NEW.booked_by := NEW.claimed_by;
    END IF;
    IF NEW.booked_at IS NULL THEN
      NEW.booked_at := now();
    END IF;
  END IF;

  -- close: claimed -> closed
  IF OLD.status = 'claimed' AND NEW.status = 'closed' THEN
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  END IF;

  -- release: claimed -> open
  IF OLD.status = 'claimed' AND NEW.status = 'open' THEN
    NEW.claimed_by := NULL;
    NEW.claimed_at := NULL;
    NEW.booked_by := NULL;
    NEW.booked_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for load status enforcement
CREATE TRIGGER enforce_load_status_rules_trigger
BEFORE UPDATE ON public.loads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_load_status_rules();