-- Fix enforce_lead_status_rules function to set search_path
CREATE OR REPLACE FUNCTION public.enforce_lead_status_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  -- claim: pending -> claimed
  if old.status = 'pending' and new.status = 'claimed' then
    if new.claimed_by is null then
      raise exception 'claimed_by required when claiming';
    end if;
    if new.claimed_at is null then
      new.claimed_at := now();
    end if;
  end if;

  -- book: claimed -> booked
  if old.status = 'claimed' and new.status = 'booked' then
    if new.booked_by is null then
      new.booked_by := new.claimed_by;
    end if;
    if new.booked_at is null then
      new.booked_at := now();
    end if;
  end if;

  -- close: claimed -> closed
  if old.status = 'claimed' and new.status = 'closed' then
    if new.closed_at is null then
      new.closed_at := now();
    end if;
  end if;

  -- release: claimed -> pending
  if old.status = 'claimed' and new.status = 'pending' then
    new.claimed_by := null;
    new.claimed_at := null;
    new.booked_by := null;
    new.booked_at := null;
  end if;

  return new;
end;
$$;

-- Add explicit restrictive policies for agency_members (INSERT/UPDATE/DELETE)
-- Only agency_admin or super_admin can manage memberships

CREATE POLICY "Only admins can insert agency members"
ON public.agency_members
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'agency_admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Only admins can update agency members"
ON public.agency_members
FOR UPDATE
USING (
  has_role(auth.uid(), 'agency_admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Only admins can delete agency members"
ON public.agency_members
FOR DELETE
USING (
  has_role(auth.uid(), 'agency_admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);