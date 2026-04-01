import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

/** Trucker Tools API does not expose linehaul / invoice amounts; rows often store 0 in money fields. */
export function isTruckerToolsLoad(templateType: string | null | undefined): boolean {
  return templateType === "truckertools";
}

export function truckerToolsHasLinehaulRate(
  load: Pick<Load, "is_per_ton" | "rate_raw" | "customer_invoice_total">,
): boolean {
  if (load.is_per_ton && load.rate_raw != null && Number(load.rate_raw) > 0) return true;
  if (load.customer_invoice_total != null && load.customer_invoice_total > 0) return true;
  if (load.rate_raw != null && Number(load.rate_raw) > 0) return true;
  return false;
}

export function shouldShowTruckerToolsTableMoneyAsTbd(load: Load): boolean {
  return isTruckerToolsLoad(load.template_type) && !truckerToolsHasLinehaulRate(load);
}
