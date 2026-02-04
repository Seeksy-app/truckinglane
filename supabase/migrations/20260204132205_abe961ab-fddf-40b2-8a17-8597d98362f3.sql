-- Schedule daily load archive at 6pm CST (00:00 UTC)
-- CST is UTC-6, so 6pm CST = midnight UTC
SELECT cron.schedule(
  'archive-daily-loads-6pm-cst',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/archive-daily-loads',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1MjQ4NzEsImV4cCI6MjA2MTEwMDg3MX0.n5R3FmfKqnSPPClFy9xLdvz09bbMeBqTj9IcX7MZi6k"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);