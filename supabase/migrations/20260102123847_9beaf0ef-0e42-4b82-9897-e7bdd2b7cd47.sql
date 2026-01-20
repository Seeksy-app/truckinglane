-- Create a database function to generate daily agency report
-- Adapts the provided SQL to work with existing schema (ai_call_summaries, lead_events, leads)

CREATE OR REPLACE FUNCTION public.get_agency_daily_report(_agency_id uuid, _date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  ai_calls bigint,
  leads_created bigint,
  leads_claimed bigint,
  leads_booked bigint,
  leads_closed bigint,
  avg_sec_call_to_claim numeric,
  claim_rate numeric,
  book_rate numeric,
  close_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH day AS (
  SELECT
    _date::timestamp AT TIME ZONE 'UTC' AS start_ts,
    (_date + interval '1 day')::timestamp AT TIME ZONE 'UTC' AS end_ts
),
ai_calls_today AS (
  SELECT count(*) AS ai_calls
  FROM ai_call_summaries c, day
  WHERE c.agency_id = _agency_id
    AND c.started_at >= day.start_ts 
    AND c.started_at < day.end_ts
),
events_today AS (
  SELECT
    e.event_type,
    count(*) AS cnt
  FROM lead_events e
  JOIN leads l ON l.id = e.lead_id, day
  WHERE l.agency_id = _agency_id
    AND e.created_at >= day.start_ts 
    AND e.created_at < day.end_ts
  GROUP BY e.event_type
),
leads_created_today AS (
  SELECT count(*) AS cnt
  FROM leads l, day
  WHERE l.agency_id = _agency_id
    AND l.created_at >= day.start_ts 
    AND l.created_at < day.end_ts
),
times AS (
  SELECT
    avg(extract(epoch from (e.created_at - l.created_at))) AS avg_sec_call_to_claim
  FROM lead_events e
  JOIN leads l ON l.id = e.lead_id, day
  WHERE l.agency_id = _agency_id
    AND e.event_type = 'claimed'
    AND e.created_at >= day.start_ts
    AND e.created_at < day.end_ts
),
summary AS (
  SELECT
    (SELECT ai_calls FROM ai_calls_today) AS ai_calls,
    (SELECT cnt FROM leads_created_today) AS leads,
    coalesce((SELECT cnt FROM events_today WHERE event_type='claimed'), 0) AS claimed,
    coalesce((SELECT cnt FROM events_today WHERE event_type='booked'), 0) AS booked,
    coalesce((SELECT cnt FROM events_today WHERE event_type='closed'), 0) AS closed,
    (SELECT avg_sec_call_to_claim FROM times) AS avg_sec_call_to_claim
)
SELECT
  coalesce(ai_calls, 0)::bigint AS ai_calls,
  coalesce(leads, 0)::bigint AS leads_created,
  coalesce(claimed, 0)::bigint AS leads_claimed,
  coalesce(booked, 0)::bigint AS leads_booked,
  coalesce(closed, 0)::bigint AS leads_closed,
  coalesce(avg_sec_call_to_claim, 0)::numeric AS avg_sec_call_to_claim,
  CASE WHEN leads > 0 THEN round((claimed::numeric / leads::numeric) * 100, 1) ELSE 0 END AS claim_rate,
  CASE WHEN leads > 0 THEN round((booked::numeric / leads::numeric) * 100, 1) ELSE 0 END AS book_rate,
  CASE WHEN leads > 0 THEN round((closed::numeric / leads::numeric) * 100, 1) ELSE 0 END AS close_rate
FROM summary;
$$;