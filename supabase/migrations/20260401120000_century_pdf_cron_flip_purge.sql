-- Daily 06:01 UTC: activate century_pdf loads shipping today; deactivate expired (no SMS booking).
-- 06:01 UTC ≈ 12:01 AM US Central during CST (UTC-6).

CREATE OR REPLACE FUNCTION public.century_pdf_daily_cron_flip_purge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE loads
  SET is_active = true
  WHERE template_type = 'century_pdf'
    AND ship_date = CURRENT_DATE
    AND is_active = false;

  UPDATE loads
  SET is_active = false
  WHERE template_type = 'century_pdf'
    AND ship_date < CURRENT_DATE - interval '1 day'
    AND is_active = true
    AND sms_book_status IS NULL;
END;
$$;

COMMENT ON FUNCTION public.century_pdf_daily_cron_flip_purge() IS
  'pg_cron (06:01 UTC): set is_active true for century_pdf loads with ship_date = today; set false when ship_date before yesterday, active, and sms_book_status IS NULL.';

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'century-pdf-daily-061-utc';

SELECT cron.schedule(
  'century-pdf-daily-061-utc',
  '1 6 * * *',
  $$SELECT public.century_pdf_daily_cron_flip_purge();$$
);
