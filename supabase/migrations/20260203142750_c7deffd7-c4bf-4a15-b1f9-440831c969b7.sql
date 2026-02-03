-- Clean up current VMS duplicates by keeping only one per unique content signature
-- Since VMS loads are essentially duplicated versions of the same email content,
-- we'll keep only unique combinations of pickup/dest/rate

-- First, delete all but keep one representative per unique content key
WITH ranked_vms AS (
  SELECT id,
    pickup_city || '|' || pickup_state || '|' || dest_city || '|' || dest_state || '|' || rate_raw::text || '|' || 
    COALESCE(source_row->>'load_instance', '1') || 'of' || COALESCE(source_row->>'total_instances', '1') as content_key,
    ROW_NUMBER() OVER (
      PARTITION BY pickup_city, pickup_state, dest_city, dest_state, rate_raw,
        source_row->>'load_instance', source_row->>'total_instances'
      ORDER BY created_at DESC
    ) as rn
  FROM loads
  WHERE template_type = 'vms_email' AND is_active = true
)
DELETE FROM loads 
WHERE id IN (
  SELECT id FROM ranked_vms WHERE rn > 1
);

-- Same for Adelphia - deduplicate based on content
WITH ranked_adelphia AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY pickup_location_raw, dest_location_raw, rate_raw, weight_lbs
      ORDER BY created_at DESC
    ) as rn
  FROM loads
  WHERE template_type = 'adelphia_xlsx' AND is_active = true
)
DELETE FROM loads 
WHERE id IN (
  SELECT id FROM ranked_adelphia WHERE rn > 1
);