-- Add attribution columns to loads table
ALTER TABLE public.loads
ADD COLUMN IF NOT EXISTS booked_source text DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS booked_call_id uuid REFERENCES public.phone_calls(id),
ADD COLUMN IF NOT EXISTS booked_lead_id uuid REFERENCES public.leads(id);

-- Add load_id to leads for direct association
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES public.loads(id);

-- Create index for faster lead lookups during attribution
CREATE INDEX IF NOT EXISTS idx_leads_caller_phone ON public.leads(caller_phone);
CREATE INDEX IF NOT EXISTS idx_leads_agency_status ON public.leads(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_loads_booked_source ON public.loads(booked_source) WHERE booked_source = 'ai';

-- Create attribution function that finds matching lead when booking a load
CREATE OR REPLACE FUNCTION public.attribute_booking_to_lead(
  _load_id uuid,
  _agency_id uuid,
  _lead_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_lead record;
  load_record record;
  result jsonb;
BEGIN
  -- Get the load details
  SELECT * INTO load_record FROM loads WHERE id = _load_id;
  
  IF load_record IS NULL THEN
    RETURN jsonb_build_object('matched', false, 'reason', 'load_not_found');
  END IF;

  -- Priority 1: Direct lead_id match if provided
  IF _lead_id IS NOT NULL THEN
    SELECT l.*, pc.id as call_id
    INTO matched_lead
    FROM leads l
    LEFT JOIN phone_calls pc ON l.phone_call_id = pc.id
    WHERE l.id = _lead_id
      AND l.agency_id = _agency_id
      AND l.status = 'pending';
    
    IF matched_lead IS NOT NULL THEN
      -- Update the load with AI attribution
      UPDATE loads 
      SET booked_source = 'ai',
          booked_lead_id = matched_lead.id,
          booked_call_id = matched_lead.call_id
      WHERE id = _load_id;
      
      RETURN jsonb_build_object(
        'matched', true, 
        'match_type', 'lead_id',
        'lead_id', matched_lead.id,
        'call_id', matched_lead.call_id
      );
    END IF;
  END IF;

  -- Priority 2: Match by caller_phone within last 24 hours
  SELECT l.*, pc.id as call_id
  INTO matched_lead
  FROM leads l
  LEFT JOIN phone_calls pc ON l.phone_call_id = pc.id
  WHERE l.agency_id = _agency_id
    AND l.status = 'pending'
    AND l.created_at >= NOW() - INTERVAL '24 hours'
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF matched_lead IS NOT NULL THEN
    -- Update the load with AI attribution
    UPDATE loads 
    SET booked_source = 'ai',
        booked_lead_id = matched_lead.id,
        booked_call_id = matched_lead.call_id
    WHERE id = _load_id;
    
    RETURN jsonb_build_object(
      'matched', true, 
      'match_type', 'recent_pending',
      'lead_id', matched_lead.id,
      'call_id', matched_lead.call_id
    );
  END IF;

  -- Priority 3: Match by board_date (same day leads)
  SELECT l.*, pc.id as call_id
  INTO matched_lead
  FROM leads l
  LEFT JOIN phone_calls pc ON l.phone_call_id = pc.id
  WHERE l.agency_id = _agency_id
    AND l.status = 'pending'
    AND DATE(l.created_at) = load_record.board_date
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF matched_lead IS NOT NULL THEN
    -- Update the load with AI attribution
    UPDATE loads 
    SET booked_source = 'ai',
        booked_lead_id = matched_lead.id,
        booked_call_id = matched_lead.call_id
    WHERE id = _load_id;
    
    RETURN jsonb_build_object(
      'matched', true, 
      'match_type', 'board_date',
      'lead_id', matched_lead.id,
      'call_id', matched_lead.call_id
    );
  END IF;

  -- No match found - mark as manual
  UPDATE loads 
  SET booked_source = 'manual',
      booked_lead_id = NULL,
      booked_call_id = NULL
  WHERE id = _load_id;

  RETURN jsonb_build_object('matched', false, 'reason', 'no_matching_lead');
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.attribute_booking_to_lead TO authenticated;