-- Backfill leads from elevenlabs_post_calls that have valid phone numbers but no leads yet
-- First, get the agency ID for the agency with phone +18887857499

DO $$
DECLARE
  target_agency_id uuid;
  rec record;
  new_lead_id uuid;
  call_cost integer;
  call_duration integer;
BEGIN
  -- Get the agency ID for the known phone number
  SELECT agency_id INTO target_agency_id
  FROM agency_phone_numbers
  WHERE phone_number LIKE '%8887857499%' AND is_active = true
  LIMIT 1;
  
  -- If no agency found by phone, use fallback
  IF target_agency_id IS NULL THEN
    SELECT id INTO target_agency_id FROM agencies LIMIT 1;
  END IF;
  
  RAISE NOTICE 'Using agency: %', target_agency_id;
  
  -- Loop through post_calls that have valid phone numbers but no corresponding leads
  FOR rec IN 
    SELECT 
      pc.id,
      pc.payload,
      pc.conversation_id,
      pc.created_at,
      COALESCE(
        pc.payload->'metadata'->'phone_call'->>'external_number',
        pc.payload->'data'->'metadata'->'phone_call'->>'external_number',
        pc.payload->>'external_number',
        pc.external_number
      ) as external_number,
      COALESCE(
        pc.payload->'analysis'->>'transcript_summary',
        pc.payload->'data'->'analysis'->>'transcript_summary',
        pc.payload->>'transcript_summary',
        pc.transcript_summary
      ) as summary,
      COALESCE(
        pc.payload->'analysis'->>'call_summary_title',
        pc.payload->'data'->'analysis'->>'call_summary_title',
        pc.payload->>'call_summary_title',
        pc.call_summary_title
      ) as summary_title,
      COALESCE(
        pc.payload->'data'->'metadata'->>'cost',
        pc.payload->'metadata'->>'cost'
      )::integer as cost,
      COALESCE(
        pc.payload->'data'->>'call_duration_secs',
        pc.payload->>'call_duration_secs',
        pc.call_duration_secs::text
      )::integer as duration,
      COALESCE(
        pc.payload->'data'->>'termination_reason',
        pc.payload->>'termination_reason',
        pc.termination_reason
      ) as termination_reason,
      COALESCE(
        pc.payload->'analysis'->>'call_successful',
        pc.payload->'data'->'analysis'->>'call_successful'
      ) as call_successful
    FROM elevenlabs_post_calls pc
    WHERE pc.created_at >= CURRENT_DATE
      AND pc.status = 'done'
      AND COALESCE(
        pc.payload->'metadata'->'phone_call'->>'external_number',
        pc.payload->'data'->'metadata'->'phone_call'->>'external_number',
        pc.payload->>'external_number',
        pc.external_number
      ) IS NOT NULL
      AND COALESCE(
        pc.payload->'metadata'->'phone_call'->>'external_number',
        pc.payload->'data'->'metadata'->'phone_call'->>'external_number',
        pc.payload->>'external_number',
        pc.external_number
      ) != 'unknown'
      AND NOT EXISTS (
        SELECT 1 FROM leads l 
        WHERE l.caller_phone = COALESCE(
          pc.payload->'metadata'->'phone_call'->>'external_number',
          pc.payload->'data'->'metadata'->'phone_call'->>'external_number',
          pc.payload->>'external_number',
          pc.external_number
        )
        AND l.created_at >= pc.created_at - interval '5 minutes'
        AND l.created_at <= pc.created_at + interval '5 minutes'
      )
  LOOP
    -- Build the notes from summary
    DECLARE
      lead_notes text := '';
    BEGIN
      IF rec.summary IS NOT NULL THEN
        lead_notes := 'AI Summary: ' || rec.summary;
      END IF;
      IF rec.summary_title IS NOT NULL THEN
        lead_notes := 'Call: ' || rec.summary_title || E'\n\n' || lead_notes;
      END IF;
      IF rec.call_successful IS NOT NULL THEN
        lead_notes := lead_notes || E'\n\nOutcome: ' || rec.call_successful;
      END IF;
      IF rec.termination_reason IS NOT NULL THEN
        lead_notes := lead_notes || E'\nTermination: ' || rec.termination_reason;
      END IF;
      IF rec.duration IS NOT NULL THEN
        lead_notes := lead_notes || E'\nDuration: ' || rec.duration || ' seconds';
      END IF;
      IF rec.cost IS NOT NULL THEN
        lead_notes := lead_notes || E'\nCall Cost: ' || rec.cost || ' credits';
      END IF;
      
      -- Create lead
      INSERT INTO leads (
        agency_id,
        caller_phone,
        status,
        notes,
        created_at,
        updated_at
      ) VALUES (
        target_agency_id,
        rec.external_number,
        'pending',
        lead_notes,
        rec.created_at,
        now()
      )
      RETURNING id INTO new_lead_id;
      
      RAISE NOTICE 'Created lead % for phone %', new_lead_id, rec.external_number;
      
      -- Create or update ai_call_summary
      INSERT INTO ai_call_summaries (
        conversation_id,
        agency_id,
        external_number,
        summary,
        summary_title,
        termination_reason,
        duration_secs,
        call_cost_credits,
        call_outcome,
        created_at
      ) VALUES (
        COALESCE(rec.conversation_id, gen_random_uuid()::text),
        target_agency_id,
        rec.external_number,
        rec.summary,
        rec.summary_title,
        rec.termination_reason,
        rec.duration,
        rec.cost,
        rec.call_successful,
        rec.created_at
      )
      ON CONFLICT (conversation_id) DO UPDATE SET
        summary = COALESCE(EXCLUDED.summary, ai_call_summaries.summary),
        summary_title = COALESCE(EXCLUDED.summary_title, ai_call_summaries.summary_title),
        termination_reason = COALESCE(EXCLUDED.termination_reason, ai_call_summaries.termination_reason),
        duration_secs = COALESCE(EXCLUDED.duration_secs, ai_call_summaries.duration_secs),
        call_cost_credits = COALESCE(EXCLUDED.call_cost_credits, ai_call_summaries.call_cost_credits),
        call_outcome = COALESCE(EXCLUDED.call_outcome, ai_call_summaries.call_outcome),
        updated_at = now();
    END;
  END LOOP;
  
  -- Also update existing post_calls to have agency_id
  UPDATE elevenlabs_post_calls 
  SET agency_id = target_agency_id
  WHERE agency_id IS NULL;
  
END $$;