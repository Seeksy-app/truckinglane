-- Fix the lead that has the wrong phone number (callback number instead of caller number)
UPDATE leads 
SET caller_phone = '+13312552600'
WHERE id = 'fbdf177e-9495-4660-b1b9-eb4fa66726ee';

-- General fix: Update leads where the phone_call's caller_phone differs from the lead's caller_phone
-- This ensures leads have the original caller's phone, not a collected callback number
UPDATE leads l
SET caller_phone = pc.caller_phone
FROM phone_calls pc
WHERE l.phone_call_id = pc.id
  AND l.caller_phone != pc.caller_phone
  AND pc.caller_phone IS NOT NULL
  AND pc.caller_phone != 'unknown'
  AND pc.caller_phone != '';