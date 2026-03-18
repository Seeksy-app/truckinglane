-- Remove the broken cron job
SELECT cron.unschedule(4);

-- Recreate with hardcoded URL and anon key
SELECT cron.schedule(
  'sync-google-loads-every-15m',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/sync-google-loads',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);