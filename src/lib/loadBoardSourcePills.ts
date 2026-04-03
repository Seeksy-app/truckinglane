import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

/** Broker source pills (order fixed). `types: null` = All. */
export const CLIENT_SOURCE_PILLS: { id: string; label: string; types: string[] | null }[] = [
  { id: "all", label: "All", types: null },
  { id: "adelphia_xlsx", label: "Adelphia", types: ["adelphia_xlsx"] },
  { id: "oldcastle_gsheet", label: "Oldcastle", types: ["oldcastle_gsheet"] },
  { id: "truckertools", label: "Trucker Tools", types: ["truckertools"] },
  { id: "__century__", label: "Century", types: ["century_xlsx", "Century"] },
  { id: "__semco__", label: "SEMCO", types: ["semco_email", "semco_xlsx"] },
  { id: "aljex_big500", label: "Big 500", types: ["aljex_big500"] },
  { id: "aljex_spot", label: "Spot Loads", types: ["aljex_spot"] },
  { id: "vms_email", label: "VMS", types: ["vms_email"] },
];

export function countLoadsForPill(loads: Load[], types: string[] | null): number {
  if (!types) return loads.length;
  const set = new Set(types);
  return loads.filter((l) => l.template_type != null && set.has(l.template_type)).length;
}
