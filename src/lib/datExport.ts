import { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

/** Loads that can be exported to DAT (matches DATStatusCard / board rules). */
export const DAT_ELIGIBLE_TEMPLATE_TYPES = ["oldcastle_gsheet", "adelphia_xlsx", "vms_email"] as const;

export function filterDatEligibleLoads(loads: Load[]): Load[] {
  return loads.filter((l) =>
    DAT_ELIGIBLE_TEMPLATE_TYPES.includes(
      l.template_type as (typeof DAT_ELIGIBLE_TEMPLATE_TYPES)[number],
    ),
  );
}

/** Today at 15:00:00.000 UTC — pending export only includes loads created strictly after this. */
export function getTodayDatNewLoadsCutoffUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0, 0));
}

/** Pending for DAT: eligible, not posted, created after 15:00 UTC today, exportable row. */
export function getDatPendingLoads(loads: Load[]): Load[] {
  const cutoff = getTodayDatNewLoadsCutoffUtc();
  return loads.filter((load) => {
    if (
      !DAT_ELIGIBLE_TEMPLATE_TYPES.includes(
        load.template_type as (typeof DAT_ELIGIBLE_TEMPLATE_TYPES)[number],
      )
    ) {
      return false;
    }
    if ((load as { dat_posted_at?: string | null }).dat_posted_at != null) return false;
    if (new Date(load.created_at).getTime() <= cutoff.getTime()) return false;
    return isExportableLoad(load);
  });
}

// Official DAT bulk upload template columns
export const DAT_COLUMNS = [
  "Pickup Earliest*",
  "Pickup Latest",
  "Length (ft)*",
  "Weight (lbs)*",
  "Full/Partial*",
  "Equipment*",
  "Use Private Network*",
  "Private Network Rate",
  "Allow Private Network Booking",
  "Allow Private Network Bidding",
  "Use DAT Loadboard*",
  "DAT Loadboard Rate",
  "Allow DAT Loadboard Booking",
  "Use Extended Network",
  "Contact Method*",
  "Origin City*",
  "Origin State*",
  "Origin Postal Code",
  "Destination City*",
  "Destination State*",
  "Destination Postal Code",
  "Comment",
  "Commodity",
  "Reference ID"
] as const;

// Format date to M/D/YYYY for DAT (no leading zeros)
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch {
    return "";
  }
}

// Get current date formatted as M/D/YYYY
function getCurrentDate(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  return `${month}/${day}/${year}`;
}

// Map trailer type to DAT equipment code
// templateType is used to default Adelphia and VMS to Flatbed
function mapEquipmentCode(trailerType: string | null | undefined, templateType?: string | null): string {
  // Default Adelphia and VMS to Flatbed if no trailer type specified
  if (!trailerType) {
    if (templateType === "adelphia_xlsx" || templateType === "vms_email" || templateType === "oldcastle_gsheet") {
      return "F"; // Flatbed
    }
    return "";
  }
  const type = trailerType.toLowerCase();
  
  // Common mappings - V=Van, R=Reefer, F=Flatbed
  if (type.includes("van") || type.includes("dry")) return "V";
  if (type.includes("reefer") || type.includes("refriger")) return "R";
  if (type.includes("flat") || type.includes("step")) return "F";
  if (type.includes("tanker")) return "T";
  if (type.includes("hopper")) return "HB";
  if (type.includes("lowboy")) return "LB";
  if (type.includes("double")) return "DD";
  if (type.includes("container")) return "C";
  
  // Return original if no mapping found
  return trailerType;
}

// Clean state field: strip anything after "/" (e.g. "IN/CHICAGO" → "IN")
function cleanState(state: string | null | undefined): string {
  if (!state) return "";
  return state.split("/")[0].trim();
}

// Check if a load is a valid exportable load (not a template note/instruction row)
function isExportableLoad(load: Load): boolean {
  const city = (load.pickup_city || "").toUpperCase();
  if (city.startsWith("PICK UP") || city.startsWith("NOTE") || city.startsWith("***")) return false;
  if (!load.pickup_city && !load.dest_city) return false;
  return true;
}

// Map a load to DAT row format
function mapLoadToDAT(load: Load): Record<string, string> {
  // Length: use trailer_footage if available, default to 48 (standard flatbed) if missing
  const lengthValue = load.trailer_footage ? String(load.trailer_footage) : "48";

  // Use current date for first two columns
  const currentDate = getCurrentDate();
  
  // Default weight to 47,000 if empty
  const weightValue = load.weight_lbs ? String(load.weight_lbs) : "47000";
  
  return {
    "Pickup Earliest*": currentDate,
    "Pickup Latest": currentDate,
    "Length (ft)*": lengthValue,
    "Weight (lbs)*": weightValue,
    "Full/Partial*": "Full",
    "Equipment*": mapEquipmentCode(load.trailer_type, load.template_type),
    "Use Private Network*": "no",
    "Private Network Rate": "",
    "Allow Private Network Booking": "no",
    "Allow Private Network Bidding": "no",
    "Use DAT Loadboard*": "yes",
    "DAT Loadboard Rate": "",
    "Allow DAT Loadboard Booking": "no",
    "Use Extended Network": "no",
    "Contact Method*": "primary phone",
    "Origin City*": load.pickup_city || "",
    "Origin State*": cleanState(load.pickup_state),
    // R / U / W / X: keep headers; fixed values per DAT template spec
    "Origin Postal Code": "",
    "Destination City*": load.dest_city || "",
    "Destination State*": cleanState(load.dest_state),
    "Destination Postal Code": "",
    "Comment": "",
    "Commodity": "",
    "Reference ID": ""
  };
}

// Escape CSV field if needed
function escapeField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Generate CSV string from loads (filters out invalid/note rows)
export function generateDATCsv(loads: Load[]): string {
  const exportableLoads = loads.filter(isExportableLoad);
  const headerLine = DAT_COLUMNS.map(escapeField).join(",");
  
  const dataLines = exportableLoads.map(load => {
    const row = mapLoadToDAT(load);
    return DAT_COLUMNS.map(col => escapeField(row[col] || "")).join(",");
  });

  return [headerLine, ...dataLines].join("\n");
}

const DAT_EXPORT_TIMESTAMP_KEY = "dat_last_export_timestamp";

// Get loads that have NOT yet been posted to DAT (dat_posted_at is null)
export function getNewLoadsSinceLastExport(loads: Load[]): Load[] {
  // Use dat_posted_at column — server-side, shared across all devices
  // A load with dat_posted_at = null has not been posted to DAT yet
  const hasPostedAny = loads.some(load => (load as any).dat_posted_at != null);
  if (hasPostedAny) {
    // Column is populated — use it as source of truth
    return loads.filter(load => (load as any).dat_posted_at == null);
  }
  // Column not yet populated (fresh install) — fall back to localStorage
  const lastExport = localStorage.getItem(DAT_EXPORT_TIMESTAMP_KEY);
  if (!lastExport) return loads;
  const lastExportDate = new Date(lastExport);
  return loads.filter(load => new Date(load.created_at) > lastExportDate);
}

// Save the current timestamp as last export time
export function markDATExportComplete(): void {
  localStorage.setItem(DAT_EXPORT_TIMESTAMP_KEY, new Date().toISOString());
}

// Get the last export timestamp for display
export function getLastDATExportTimestamp(): string | null {
  return localStorage.getItem(DAT_EXPORT_TIMESTAMP_KEY);
}

// Download the CSV file
export function downloadDATExport(loads: Load[], filename?: string): void {
  const csvContent = generateDATCsv(loads);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  
  const today = new Date().toISOString().split("T")[0];
  link.download = filename || `DAT_Export_${today}.csv`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
