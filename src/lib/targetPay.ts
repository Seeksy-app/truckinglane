/**
 * Universal carrier pay rules (all load sources):
 * - Flat (is_per_ton = false): target_pay = COALESCE(rate_raw, customer_invoice_total) * 0.80,
 *   max_pay = same base * 0.85
 * - Per ton: target_pay = rate_raw - 10, max_pay = rate_raw - 5 (same units as rate_raw)
 *
 * Keep in sync with supabase/functions/_shared/targetPay.ts
 */

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Revenue base for flat loads: prefer positive rate_raw, else positive customer_invoice_total. */
export function flatRateBase(
  rateRaw: number | null | undefined,
  customerInvoiceTotal: number | null | undefined,
): number | null {
  const r = rateRaw != null && Number.isFinite(Number(rateRaw)) ? Number(rateRaw) : NaN;
  if (Number.isFinite(r) && r > 0) return r;
  const inv = customerInvoiceTotal != null && Number.isFinite(Number(customerInvoiceTotal))
    ? Number(customerInvoiceTotal)
    : NaN;
  if (Number.isFinite(inv) && inv > 0) return inv;
  return null;
}

export function computeTargetPayMaxPay(
  isPerTon: boolean,
  rateRaw: number | null | undefined,
  customerInvoiceTotal: number | null | undefined,
): { target_pay: number; max_pay: number } {
  if (isPerTon) {
    const r = rateRaw != null && Number.isFinite(Number(rateRaw)) ? Number(rateRaw) : 0;
    if (r <= 0) return { target_pay: 0, max_pay: 0 };
    return {
      target_pay: roundMoney(Math.max(0, r - 10)),
      max_pay: roundMoney(Math.max(0, r - 5)),
    };
  }
  const base = flatRateBase(rateRaw, customerInvoiceTotal);
  if (base == null || base <= 0) return { target_pay: 0, max_pay: 0 };
  return {
    target_pay: roundMoney(base * 0.8),
    max_pay: roundMoney(base * 0.85),
  };
}

export function computeCommissions(args: {
  isPerTon: boolean;
  rateRaw: number | null | undefined;
  customerInvoiceTotal: number;
  targetPay: number;
  maxPay: number;
  weightLbs: number | null | undefined;
}): {
  target_commission: number;
  max_commission: number;
  commission_target_pct: number;
  commission_max_pct: number;
} {
  const inv = args.customerInvoiceTotal;
  const tons =
    args.weightLbs != null && Number.isFinite(Number(args.weightLbs)) && Number(args.weightLbs) > 0
      ? Number(args.weightLbs) / 2000
      : 0;

  if (args.isPerTon) {
    if (tons > 0 && inv > 0) {
      const carrierTarget = args.targetPay * tons;
      const carrierMax = args.maxPay * tons;
      return {
        target_commission: roundMoney(Math.max(0, inv - carrierTarget)),
        max_commission: roundMoney(Math.max(0, inv - carrierMax)),
        commission_target_pct: 0.2,
        commission_max_pct: 0.15,
      };
    }
    return {
      target_commission: 0,
      max_commission: 0,
      commission_target_pct: 0.2,
      commission_max_pct: 0.15,
    };
  }

  const base = flatRateBase(args.rateRaw, inv) ?? (inv > 0 ? inv : 0);
  if (base <= 0) {
    return {
      target_commission: 0,
      max_commission: 0,
      commission_target_pct: 0.2,
      commission_max_pct: 0.15,
    };
  }
  return {
    target_commission: roundMoney(base * 0.2),
    max_commission: roundMoney(base * 0.15),
    commission_target_pct: 0.2,
    commission_max_pct: 0.15,
  };
}

export function calculateRateFields(
  rateRaw: number | null,
  weightLbs: number | null,
  isPerTon: boolean,
): {
  rate_raw: number | null;
  is_per_ton: boolean;
  customer_invoice_total: number;
  target_pay: number;
  target_commission: number;
  max_pay: number;
  max_commission: number;
  commission_target_pct: number;
  commission_max_pct: number;
} {
  if (rateRaw === null || rateRaw === 0) {
    return {
      rate_raw: null,
      is_per_ton: isPerTon,
      customer_invoice_total: 0,
      target_pay: 0,
      target_commission: 0,
      max_pay: 0,
      max_commission: 0,
      commission_target_pct: 0.2,
      commission_max_pct: 0.15,
    };
  }

  const rate = rateRaw;
  const weightTons = (weightLbs || 0) / 2000;
  let invoiceTotal = 0;
  if (isPerTon) {
    if (weightTons > 0) {
      invoiceTotal = Math.round(rate * weightTons);
    }
  } else {
    invoiceTotal = Math.round(rate);
  }

  const { target_pay, max_pay } = computeTargetPayMaxPay(isPerTon, rate, invoiceTotal);
  const comm = computeCommissions({
    isPerTon: isPerTon,
    rateRaw: rate,
    customerInvoiceTotal: invoiceTotal,
    targetPay: target_pay,
    maxPay: max_pay,
    weightLbs,
  });

  return {
    rate_raw: rate,
    is_per_ton: isPerTon,
    customer_invoice_total: invoiceTotal,
    target_pay,
    max_pay,
    ...comm,
  };
}
