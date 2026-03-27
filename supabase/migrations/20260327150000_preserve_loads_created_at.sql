-- Keep loads.created_at as true row creation time. Import/sync upserts must not advance it,
-- otherwise the dashboard "NEW" count (created_at vs last viewed) treats refreshed rows as new.

CREATE OR REPLACE FUNCTION public.preserve_loads_created_at_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER loads_preserve_created_at
BEFORE UPDATE ON public.loads
FOR EACH ROW
EXECUTE FUNCTION public.preserve_loads_created_at_on_update();
