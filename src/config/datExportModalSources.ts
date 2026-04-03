/**
 * Export to DAT modal — one source of truth for source rows (labels + template_type mapping).
 * Imported by `datExport.ts` (counts/fetch) and `DatExportModal.tsx` (render list).
 */
export const DAT_EXPORT_SOURCE_GROUPS = [
  { id: "big500", label: "Big 500", templateTypes: ["aljex_big500"] as const },
  { id: "spot", label: "Spot Loads", templateTypes: ["aljex_spot"] as const },
  { id: "vms", label: "VMS", templateTypes: ["vms_email"] as const },
  { id: "adelphia", label: "Adelphia", templateTypes: ["adelphia_xlsx"] as const },
  { id: "oldcastle", label: "Oldcastle", templateTypes: ["oldcastle_gsheet"] as const },
  { id: "century", label: "Century", templateTypes: ["century_xlsx", "Century"] as const },
  { id: "semco", label: "SEMCO", templateTypes: ["semco_email"] as const },
  { id: "truckertools", label: "Trucker Tools", templateTypes: ["truckertools"] as const },
] as const;

export type DatExportSourceGroupId = (typeof DAT_EXPORT_SOURCE_GROUPS)[number]["id"];
