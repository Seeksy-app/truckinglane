
-- Replace the updated_at trigger to only bump when meaningful data changes
-- This prevents no-op upserts from marking loads as "new"
CREATE OR REPLACE FUNCTION update_loads_updated_at()
RETURNS trigger AS $$
BEGIN
  -- Only bump updated_at if actual load data changed
  IF ROW(
    OLD.is_active, OLD.status, OLD.rate_raw, OLD.pickup_city, OLD.pickup_state,
    OLD.dest_city, OLD.dest_state, OLD.ship_date, OLD.delivery_date, 
    OLD.trailer_type, OLD.weight_lbs, OLD.commodity, OLD.load_call_script,
    OLD.booked_at, OLD.archived_at, OLD.load_number, OLD.pickup_location_raw,
    OLD.dest_location_raw, OLD.customer_invoice_total, OLD.target_pay, OLD.max_pay,
    OLD.tarp_required, OLD.trailer_footage, OLD.miles, OLD.pickup_zip, OLD.dest_zip
  ) IS DISTINCT FROM ROW(
    NEW.is_active, NEW.status, NEW.rate_raw, NEW.pickup_city, NEW.pickup_state,
    NEW.dest_city, NEW.dest_state, NEW.ship_date, NEW.delivery_date,
    NEW.trailer_type, NEW.weight_lbs, NEW.commodity, NEW.load_call_script,
    NEW.booked_at, NEW.archived_at, NEW.load_number, NEW.pickup_location_raw,
    NEW.dest_location_raw, NEW.customer_invoice_total, NEW.target_pay, NEW.max_pay,
    NEW.tarp_required, NEW.trailer_footage, NEW.miles, NEW.pickup_zip, NEW.dest_zip
  ) THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
