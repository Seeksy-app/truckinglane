-- Persist trailer_footage from Trucker Tools (extension sends trailer_footage); include in conflict refresh.

CREATE OR REPLACE FUNCTION public.tl_upsert_aljex_loads_batch(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN;
  END IF;

  FOR j IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.loads AS l (
      agency_id,
      template_type,
      load_number,
      dispatch_status,
      status,
      pickup_city,
      pickup_state,
      pickup_zip,
      dest_city,
      dest_state,
      dest_zip,
      ship_date,
      commodity,
      weight_lbs,
      miles,
      trailer_footage,
      is_per_ton,
      customer_invoice_total,
      target_pay,
      max_pay,
      target_commission,
      max_commission,
      commission_target_pct,
      commission_max_pct,
      rate_raw,
      is_active,
      trailer_type,
      source_row,
      pickup_location_raw,
      dest_location_raw,
      delivery_date,
      board_date,
      archived_at
    )
    VALUES (
      (j->>'agency_id')::uuid,
      j->>'template_type',
      j->>'load_number',
      COALESCE(j->>'dispatch_status', 'open'),
      COALESCE(j->>'status', 'open'),
      j->>'pickup_city',
      j->>'pickup_state',
      j->>'pickup_zip',
      j->>'dest_city',
      j->>'dest_state',
      j->>'dest_zip',
      NULLIF(j->>'ship_date', '')::date,
      j->>'commodity',
      CASE
        WHEN j ? 'weight_lbs' AND jsonb_typeof(j->'weight_lbs') = 'number' THEN (j->'weight_lbs')::text::numeric
        ELSE NULLIF(j->>'weight_lbs', '')::numeric
      END,
      CASE
        WHEN j ? 'miles' AND jsonb_typeof(j->'miles') IN ('number', 'string') THEN (j->'miles') #>> '{}'
        ELSE NULL
      END,
      CASE
        WHEN j ? 'trailer_footage' AND jsonb_typeof(j->'trailer_footage') = 'number' THEN (j->'trailer_footage')::text::numeric
        ELSE NULLIF(j->>'trailer_footage', '')::numeric
      END,
      COALESCE((j->>'is_per_ton')::boolean, false),
      COALESCE(NULLIF(j->>'customer_invoice_total', '')::numeric, 0),
      COALESCE(NULLIF(j->>'target_pay', '')::numeric, 0),
      COALESCE(NULLIF(j->>'max_pay', '')::numeric, 0),
      NULLIF(j->>'target_commission', '')::numeric,
      NULLIF(j->>'max_commission', '')::numeric,
      COALESCE(NULLIF(j->>'commission_target_pct', '')::numeric, 0),
      COALESCE(NULLIF(j->>'commission_max_pct', '')::numeric, 0),
      NULLIF(j->>'rate_raw', '')::numeric,
      COALESCE((j->>'is_active')::boolean, true),
      j->>'trailer_type',
      CASE
        WHEN j ? 'source_row' AND jsonb_typeof(j->'source_row') = 'string' THEN (j->>'source_row')::jsonb
        WHEN j ? 'source_row' THEN j->'source_row'
        ELSE NULL
      END,
      j->>'pickup_location_raw',
      j->>'dest_location_raw',
      NULLIF(j->>'delivery_date', '')::date,
      COALESCE(NULLIF(j->>'board_date', '')::date, (CURRENT_TIMESTAMP AT TIME ZONE 'utc')::date),
      NULLIF(j->>'archived_at', '')::timestamptz
    )
    ON CONFLICT (agency_id, template_type, load_number)
    DO UPDATE SET
      pickup_city = EXCLUDED.pickup_city,
      pickup_state = EXCLUDED.pickup_state,
      dest_city = EXCLUDED.dest_city,
      dest_state = EXCLUDED.dest_state,
      trailer_type = EXCLUDED.trailer_type,
      rate_raw = EXCLUDED.rate_raw,
      target_pay = EXCLUDED.target_pay,
      max_pay = EXCLUDED.max_pay,
      target_commission = EXCLUDED.target_commission,
      max_commission = EXCLUDED.max_commission,
      weight_lbs = EXCLUDED.weight_lbs,
      ship_date = EXCLUDED.ship_date,
      miles = EXCLUDED.miles,
      commodity = EXCLUDED.commodity,
      trailer_footage = EXCLUDED.trailer_footage;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.tl_upsert_aljex_loads_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tl_upsert_aljex_loads_batch(jsonb) TO service_role;
