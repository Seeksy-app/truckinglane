import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

/**
 * Dashboard NEW card: open-dispatch loads (all template types) created after this agent's
 * cutoff — `last_viewed_new_at` from `agent_new_loads_view`, or start of local today if unset.
 */
export function isOpenLoadForNewCard(load: Load, cutoffIso: string): boolean {
  if (!load.is_active) return false;
  if (load.template_type === "aljex_big500") {
    const n = load.customer_invoice_total;
    if (n == null || Number(n) <= 0) return false;
  }
  const dispOpen =
    load.dispatch_status === "open" ||
    (load.dispatch_status == null && load.status === "open");
  if (!dispOpen) return false;
  return new Date(load.created_at).getTime() > new Date(cutoffIso).getTime();
}
