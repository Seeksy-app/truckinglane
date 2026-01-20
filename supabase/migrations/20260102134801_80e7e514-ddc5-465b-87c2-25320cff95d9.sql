-- Fix get_metrics_summary to use elevenlabs_post_calls as the source for AI calls
-- This aligns Reports with General Analytics which already uses elevenlabs_post_calls

CREATE OR REPLACE FUNCTION public.get_metrics_summary(
  p_agency_id uuid, 
  p_agent_id uuid DEFAULT NULL::uuid, 
  p_start_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, 
  p_end_ts timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_ai_calls_total bigint;
  v_ai_calls_with_phone bigint;
  v_leads_created bigint;
  v_leads_claimed bigint;
  v_leads_booked bigint;
  v_leads_closed bigint;
  v_leads_pending bigint;
  v_avg_claim_seconds numeric;
  v_total_call_minutes numeric;
  v_high_intent_count bigint;
  v_engaged_calls bigint;
  v_quick_hangups bigint;
BEGIN
  -- AI Calls from elevenlabs_post_calls (same source as General tab)
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE external_number IS NOT NULL AND LENGTH(external_number) >= 10),
    COALESCE(SUM(call_duration_secs) / 60.0, 0),
    COUNT(*) FILTER (WHERE call_duration_secs >= 20),
    COUNT(*) FILTER (WHERE call_duration_secs < 10)
  INTO 
    v_ai_calls_total,
    v_ai_calls_with_phone,
    v_total_call_minutes,
    v_engaged_calls,
    v_quick_hangups
  FROM elevenlabs_post_calls
  WHERE (p_agency_id IS NULL OR agency_id = p_agency_id)
    AND (p_start_ts IS NULL OR created_at >= p_start_ts)
    AND (p_end_ts IS NULL OR created_at < p_end_ts);

  -- Leads metrics from leads table
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('claimed', 'booked', 'closed')),
    COUNT(*) FILTER (WHERE status = 'booked'),
    COUNT(*) FILTER (WHERE status = 'closed'),
    COUNT(*) FILTER (WHERE status = 'pending')
  INTO 
    v_leads_created,
    v_leads_claimed,
    v_leads_booked,
    v_leads_closed,
    v_leads_pending
  FROM leads
  WHERE (p_agency_id IS NULL OR agency_id = p_agency_id)
    AND (p_start_ts IS NULL OR created_at >= p_start_ts)
    AND (p_end_ts IS NULL OR created_at < p_end_ts)
    AND (p_agent_id IS NULL OR claimed_by = p_agent_id);

  -- High intent count from leads
  SELECT COUNT(*)
  INTO v_high_intent_count
  FROM leads
  WHERE (p_agency_id IS NULL OR agency_id = p_agency_id)
    AND is_high_intent = true
    AND (p_start_ts IS NULL OR created_at >= p_start_ts)
    AND (p_end_ts IS NULL OR created_at < p_end_ts);

  -- Average time to claim (seconds)
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (claimed_at - created_at))), 0)
  INTO v_avg_claim_seconds
  FROM leads
  WHERE (p_agency_id IS NULL OR agency_id = p_agency_id)
    AND claimed_at IS NOT NULL
    AND (p_start_ts IS NULL OR created_at >= p_start_ts)
    AND (p_end_ts IS NULL OR created_at < p_end_ts);

  -- Ensure engaged >= leads (canonical invariant from analyticsLogic.ts)
  IF v_leads_created > 0 AND v_engaged_calls < v_leads_created THEN
    v_engaged_calls := LEAST(v_leads_created, v_ai_calls_total);
  END IF;

  -- Build result JSON
  v_result := jsonb_build_object(
    'ai_calls', v_ai_calls_total,
    'ai_calls_with_phone', v_ai_calls_with_phone,
    'leads_created', v_leads_created,
    'leads_claimed', v_leads_claimed,
    'leads_booked', v_leads_booked,
    'leads_closed', v_leads_closed,
    'leads_pending', v_leads_pending,
    'engaged_calls', v_engaged_calls,
    'quick_hangups', v_quick_hangups,
    'high_intent', v_high_intent_count,
    'total_minutes', ROUND(v_total_call_minutes::numeric, 1),
    'avg_claim_seconds', ROUND(v_avg_claim_seconds::numeric, 0),
    'claim_rate', CASE WHEN v_leads_created > 0 THEN ROUND((v_leads_claimed::numeric / v_leads_created) * 100, 1) ELSE 0 END,
    'book_rate', CASE WHEN v_leads_created > 0 THEN ROUND((v_leads_booked::numeric / v_leads_created) * 100, 1) ELSE 0 END,
    'close_rate', CASE WHEN v_leads_created > 0 THEN ROUND((v_leads_closed::numeric / v_leads_created) * 100, 1) ELSE 0 END,
    'conversion_rate', CASE WHEN v_ai_calls_total > 0 THEN ROUND((v_leads_booked::numeric / v_ai_calls_total) * 100, 1) ELSE 0 END
  );

  RETURN v_result;
END;
$function$;