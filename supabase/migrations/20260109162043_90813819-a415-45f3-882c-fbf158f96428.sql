-- Create a comprehensive analytics KPIs RPC that returns all metrics needed
-- Includes: AI Minutes, High Intent (with delta), Callback Speed, AEI Score

CREATE OR REPLACE FUNCTION public.analytics_kpis(
  p_agency_id uuid,
  p_start_ts timestamptz DEFAULT NULL,
  p_end_ts timestamptz DEFAULT NULL,
  p_agent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  -- Current period metrics
  v_ai_calls bigint := 0;
  v_ai_minutes numeric := 0;
  v_high_intent_count bigint := 0;
  v_callback_speed_avg numeric := NULL;
  v_booked_count bigint := 0;
  v_leads_count bigint := 0;
  v_quick_hangups bigint := 0;
  v_engaged_calls bigint := 0;
  -- Previous period for delta calculation
  v_prev_high_intent bigint := 0;
  v_high_intent_delta bigint := 0;
  v_period_duration interval;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  -- AEI calculation
  v_conversion numeric := 0;
  v_quality numeric := 0;
  v_intent_factor numeric := 0;
  v_aei_score integer := 0;
BEGIN
  -- Calculate period duration for delta comparison
  IF p_start_ts IS NOT NULL AND p_end_ts IS NOT NULL THEN
    v_period_duration := p_end_ts - p_start_ts;
    v_prev_end := p_start_ts;
    v_prev_start := p_start_ts - v_period_duration;
  END IF;

  -- AI Calls and Minutes from ai_call_summaries (primary source)
  SELECT 
    COUNT(*),
    COALESCE(SUM(duration_secs) / 60.0, 0),
    COUNT(*) FILTER (WHERE duration_secs < 10),
    COUNT(*) FILTER (WHERE duration_secs >= 20),
    COUNT(*) FILTER (WHERE is_high_intent = true)
  INTO 
    v_ai_calls,
    v_ai_minutes,
    v_quick_hangups,
    v_engaged_calls,
    v_high_intent_count
  FROM ai_call_summaries
  WHERE agency_id = p_agency_id
    AND (p_start_ts IS NULL OR started_at >= p_start_ts)
    AND (p_end_ts IS NULL OR started_at < p_end_ts);

  -- If no ai_call_summaries, fall back to elevenlabs_post_calls
  IF v_ai_calls = 0 THEN
    SELECT 
      COUNT(*),
      COALESCE(SUM(call_duration_secs) / 60.0, 0),
      COUNT(*) FILTER (WHERE call_duration_secs < 10),
      COUNT(*) FILTER (WHERE call_duration_secs >= 20)
    INTO 
      v_ai_calls,
      v_ai_minutes,
      v_quick_hangups,
      v_engaged_calls
    FROM elevenlabs_post_calls
    WHERE agency_id = p_agency_id
      AND (p_start_ts IS NULL OR created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR created_at < p_end_ts);
  END IF;

  -- Leads metrics including high intent from leads table
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'booked'),
    COUNT(*) FILTER (WHERE is_high_intent = true OR intent_score >= 85)
  INTO 
    v_leads_count,
    v_booked_count,
    v_high_intent_count
  FROM leads
  WHERE agency_id = p_agency_id
    AND (p_start_ts IS NULL OR created_at >= p_start_ts)
    AND (p_end_ts IS NULL OR created_at < p_end_ts)
    AND (p_agent_id IS NULL OR claimed_by = p_agent_id);

  -- Also count high intent from ai_call_summaries if not already counted
  IF v_high_intent_count = 0 THEN
    SELECT COUNT(*)
    INTO v_high_intent_count
    FROM ai_call_summaries
    WHERE agency_id = p_agency_id
      AND is_high_intent = true
      AND (p_start_ts IS NULL OR started_at >= p_start_ts)
      AND (p_end_ts IS NULL OR started_at < p_end_ts);
  END IF;

  -- Callback Speed: Average time from callback_requested_at to callback completion
  -- Using leads table callback_requested_at and claimed_at as proxy
  SELECT AVG(EXTRACT(EPOCH FROM (claimed_at - callback_requested_at)))
  INTO v_callback_speed_avg
  FROM leads
  WHERE agency_id = p_agency_id
    AND callback_requested_at IS NOT NULL
    AND claimed_at IS NOT NULL
    AND claimed_at > callback_requested_at
    AND (p_start_ts IS NULL OR created_at >= p_start_ts)
    AND (p_end_ts IS NULL OR created_at < p_end_ts)
    AND (p_agent_id IS NULL OR claimed_by = p_agent_id);

  -- Alternative: Use ai_call_summaries callback_speed_secs if available
  IF v_callback_speed_avg IS NULL THEN
    SELECT AVG(callback_speed_secs)
    INTO v_callback_speed_avg
    FROM ai_call_summaries
    WHERE agency_id = p_agency_id
      AND callback_speed_secs IS NOT NULL
      AND callback_speed_secs > 0
      AND (p_start_ts IS NULL OR started_at >= p_start_ts)
      AND (p_end_ts IS NULL OR started_at < p_end_ts);
  END IF;

  -- Previous period high intent for delta calculation
  IF v_prev_start IS NOT NULL AND v_prev_end IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_prev_high_intent
    FROM leads
    WHERE agency_id = p_agency_id
      AND (is_high_intent = true OR intent_score >= 85)
      AND created_at >= v_prev_start
      AND created_at < v_prev_end
      AND (p_agent_id IS NULL OR claimed_by = p_agent_id);
    
    v_high_intent_delta := v_high_intent_count - v_prev_high_intent;
  END IF;

  -- Calculate AEI Score (0-100)
  -- Formula: (conversion * 0.45) + (quality * 0.35) + (intent_factor * 0.20) * 100
  IF v_ai_calls > 0 THEN
    v_conversion := (v_booked_count + v_leads_count)::numeric / v_ai_calls;
    v_quality := 1.0 - (v_quick_hangups::numeric / v_ai_calls);
    v_intent_factor := v_high_intent_count::numeric / v_ai_calls;
    
    v_aei_score := LEAST(100, GREATEST(0, ROUND(
      (v_conversion * 0.45 + v_quality * 0.35 + v_intent_factor * 0.20) * 100
    )));
  END IF;

  -- Ensure engaged >= leads (invariant)
  IF v_leads_count > 0 AND v_engaged_calls < v_leads_count THEN
    v_engaged_calls := LEAST(v_leads_count, v_ai_calls);
  END IF;

  -- Build result JSON
  v_result := jsonb_build_object(
    'ai_calls', v_ai_calls,
    'ai_minutes', ROUND(v_ai_minutes::numeric, 1),
    'high_intent_count', v_high_intent_count,
    'high_intent_delta', v_high_intent_delta,
    'callback_speed_seconds_avg', v_callback_speed_avg,
    'aei_score', v_aei_score,
    'booked_count', v_booked_count,
    'leads_count', v_leads_count,
    'quick_hangups_count', v_quick_hangups,
    'engaged_calls', v_engaged_calls
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.analytics_kpis(uuid, timestamptz, timestamptz, uuid) TO authenticated;