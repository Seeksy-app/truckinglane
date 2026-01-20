-- Add follow_up_status column to leads for tracking why claimed leads are still claimed
ALTER TABLE public.leads 
ADD COLUMN follow_up_status text DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.leads.follow_up_status IS 'Tracking status for claimed leads: contacted_waiting, carrier_callback, driver_callback, other';