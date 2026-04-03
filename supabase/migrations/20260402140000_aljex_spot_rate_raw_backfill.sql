-- Spot loads: backfill rate_raw from customer linehaul when missing (universal flat pay uses rate_raw).
UPDATE public.loads
SET rate_raw = customer_invoice_total
WHERE template_type = 'aljex_spot'
  AND rate_raw IS NULL
  AND customer_invoice_total IS NOT NULL;

-- Realign carrier pay for flat spot loads now that rate_raw is set (80% / 85% of linehaul).
UPDATE public.loads
SET
  target_pay = round((rate_raw * 0.80)::numeric, 2),
  max_pay = round((rate_raw * 0.85)::numeric, 2),
  target_commission = round((rate_raw * 0.20)::numeric, 2),
  max_commission = round((rate_raw * 0.15)::numeric, 2)
WHERE template_type = 'aljex_spot'
  AND is_per_ton = false
  AND rate_raw IS NOT NULL
  AND rate_raw > 0;
