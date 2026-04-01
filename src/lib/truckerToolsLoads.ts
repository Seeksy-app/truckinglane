import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

export function isTruckerToolsLoad(templateType: string | null | undefined): boolean {
  return templateType === "truckertools";
}

/** Trucker Tools: "—" for null/0; positive amounts formatted. Returns undefined if not TT (caller uses normal rules). */
export function truckerToolsDollarDisplay(
  templateType: string | null | undefined,
  value: number | null | undefined,
): string | undefined {
  if (templateType !== "truckertools") return undefined;
  if (value == null || value === 0) return "—";
  return `$${Number(value).toLocaleString()}`;
}

/** TT rate / linehaul: "—" when missing or ≤0. */
export function truckerToolsRateFieldDisplay(
  templateType: string | null | undefined,
  rateRaw: number | null | undefined,
  isPerTon: boolean,
): string | undefined {
  if (templateType !== "truckertools") return undefined;
  if (rateRaw == null || Number(rateRaw) <= 0) return "—";
  if (isPerTon) return `$${Number(rateRaw).toLocaleString()}/ton`;
  return `$${Number(rateRaw).toLocaleString()}`;
}

/** Loads table Invoice column: same basis as flat vs per-ton invoice/rate. */
export function truckerToolsInvoiceColumnDisplay(
  load: Pick<Load, "template_type" | "is_per_ton" | "rate_raw" | "customer_invoice_total">,
): { display: string; isPerTon: boolean } | null {
  if (load.template_type !== "truckertools") return null;
  if (load.is_per_ton) {
    if (load.rate_raw == null || Number(load.rate_raw) <= 0) {
      return { display: "—", isPerTon: false };
    }
    return { display: `$${Number(load.rate_raw).toLocaleString()}`, isPerTon: true };
  }
  const inv = load.customer_invoice_total;
  const raw = load.rate_raw;
  const hasInv = inv != null && inv > 0;
  const hasRaw = raw != null && Number(raw) > 0;
  if (!hasInv && !hasRaw) return { display: "—", isPerTon: false };
  if (hasInv) return { display: `$${Number(inv).toLocaleString()}`, isPerTon: false };
  return { display: `$${Number(raw).toLocaleString()}`, isPerTon: false };
}

/** Full-page load detail: single string for the Invoice line (includes " / ton" when per-ton). */
export function truckerToolsInvoiceDetailLine(
  load: Pick<Load, "template_type" | "is_per_ton" | "rate_raw" | "customer_invoice_total">,
): string | undefined {
  const col = truckerToolsInvoiceColumnDisplay(load);
  if (!col) return undefined;
  if (col.isPerTon) return `${col.display} / ton`;
  return col.display;
}
