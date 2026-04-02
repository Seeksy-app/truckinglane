-- Extend nightly Century cron: include template_type 'Century' (parse-century-email) and flip pending → open when ship_date is today.

CREATE OR REPLACE FUNCTION public.century_pdf_daily_cron_flip_purge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE loads
  SET is_active = true
  WHERE template_type IN ('century_pdf', 'Century')
    AND ship_date = CURRENT_DATE
    AND is_active = false;

  UPDATE loads
  SET dispatch_status = 'open'
  WHERE template_type IN ('century_pdf', 'Century')
    AND ship_date = CURRENT_DATE
    AND dispatch_status = 'pending';

  UPDATE loads
  SET is_active = false
  WHERE template_type IN ('century_pdf', 'Century')
    AND ship_date < CURRENT_DATE - interval '1 day'
    AND is_active = true
    AND sms_book_status IS NULL;
END;
$$;

COMMENT ON FUNCTION public.century_pdf_daily_cron_flip_purge() IS
  'pg_cron (06:01 UTC): activate century_pdf/Century loads with ship_date=today; pending→open for that ship date; deactivate expired loads (no SMS booking).';
