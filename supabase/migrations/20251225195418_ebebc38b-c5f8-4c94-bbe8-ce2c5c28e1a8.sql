-- Fix security definer view by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_status_latest;

CREATE VIEW public.public_status_latest 
WITH (security_invoker = true) AS
SELECT DISTINCT ON (service)
  service,
  status,
  message,
  latency_ms,
  checked_at
FROM public.status_checks
ORDER BY service, checked_at DESC;