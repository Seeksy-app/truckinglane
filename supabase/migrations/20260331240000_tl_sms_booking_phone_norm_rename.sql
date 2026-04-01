-- Legacy installs used phone_normalized; align with tl-trigger.py (phone_norm).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tl_sms_booking_context'
      AND column_name = 'phone_normalized'
  ) THEN
    ALTER TABLE public.tl_sms_booking_context RENAME COLUMN phone_normalized TO phone_norm;
  END IF;
END $$;
