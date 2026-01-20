-- Backfill leads from all elevenlabs_post_calls with valid phone numbers
INSERT INTO leads (
  agency_id,
  caller_phone,
  caller_name,
  notes,
  status,
  created_at
)
SELECT DISTINCT ON (
  epc.agency_id,
  COALESCE(
    NULLIF(epc.external_number, 'unknown'),
    epc.payload->'metadata'->'phone_call'->>'external_number'
  )
)
  epc.agency_id,
  COALESCE(
    NULLIF(epc.external_number, 'unknown'),
    epc.payload->'metadata'->'phone_call'->>'external_number'
  ) as caller_phone,
  COALESCE(
    epc.payload->'data'->'metadata'->>'carrier_name',
    epc.payload->'metadata'->>'carrier_name',
    'Unknown Caller'
  ) as caller_name,
  COALESCE(
    epc.transcript_summary,
    epc.payload->'data'->>'transcript_summary',
    epc.payload->>'transcript_summary'
  ) as notes,
  'pending'::lead_status as status,
  epc.created_at
FROM elevenlabs_post_calls epc
WHERE epc.agency_id IS NOT NULL
  AND (
    (epc.external_number IS NOT NULL AND epc.external_number != 'unknown' AND epc.external_number != '')
    OR (epc.payload->'metadata'->'phone_call'->>'external_number' IS NOT NULL 
        AND epc.payload->'metadata'->'phone_call'->>'external_number' != 'unknown'
        AND epc.payload->'metadata'->'phone_call'->>'external_number' != '')
  )
  -- Only insert if no lead exists for this phone + agency combo
  AND NOT EXISTS (
    SELECT 1 FROM leads l 
    WHERE l.agency_id = epc.agency_id
      AND l.caller_phone = COALESCE(
        NULLIF(epc.external_number, 'unknown'),
        epc.payload->'metadata'->'phone_call'->>'external_number'
      )
  )
ORDER BY 
  epc.agency_id,
  COALESCE(
    NULLIF(epc.external_number, 'unknown'),
    epc.payload->'metadata'->'phone_call'->>'external_number'
  ),
  epc.created_at DESC;