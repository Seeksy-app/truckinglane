-- One-time backfill: universal carrier pay rules for active loads missing carrier pay.
-- Flat: COALESCE(rate_raw, customer_invoice_total) * 0.80 / 0.85
-- Per ton: rate_raw - 10 / rate_raw - 5 ($/ton)

UPDATE public.loads
SET
  target_pay = CASE
    WHEN is_per_ton THEN
      CASE
        WHEN rate_raw IS NOT NULL AND rate_raw > 0 THEN round((rate_raw - 10)::numeric, 2)
        ELSE 0
      END
    ELSE
      CASE
        WHEN COALESCE(rate_raw, customer_invoice_total) IS NOT NULL
          AND COALESCE(rate_raw, customer_invoice_total) > 0
        THEN round((COALESCE(rate_raw, customer_invoice_total) * 0.80)::numeric, 2)
        ELSE 0
      END
  END,
  max_pay = CASE
    WHEN is_per_ton THEN
      CASE
        WHEN rate_raw IS NOT NULL AND rate_raw > 0 THEN round((rate_raw - 5)::numeric, 2)
        ELSE 0
      END
    ELSE
      CASE
        WHEN COALESCE(rate_raw, customer_invoice_total) IS NOT NULL
          AND COALESCE(rate_raw, customer_invoice_total) > 0
        THEN round((COALESCE(rate_raw, customer_invoice_total) * 0.85)::numeric, 2)
        ELSE 0
      END
  END
WHERE is_active = true
  AND dispatch_status IS DISTINCT FROM 'archived'
  AND (target_pay IS NULL OR target_pay = 0);
