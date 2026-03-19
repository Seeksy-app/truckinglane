-- Remove old 6pm CST cron job
SELECT cron.unschedule('archive-daily-loads-6pm-cst');

-- Create new midnight Eastern cron (5 AM UTC)
SELECT cron.schedule(
  'archive-daily-loads-midnight-et',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/archive-daily-loads',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);