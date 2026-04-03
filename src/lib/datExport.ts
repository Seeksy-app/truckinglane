import type { SupabaseClient } from "@supabase/supabase-js";
import { Tables } from "@/integrations/supabase/types";
import {
  DAT_EXPORT_SOURCE_GROUPS,
  type DatExportSourceGroupId,
} from "@/config/datExportModalSources";

export type { DatExportSourceGroupId };
export { DAT_EXPORT_SOURCE_GROUPS };

type Load = Tables<"loads">;

/**
 * DAT board + CSV export eligibility (template_type).
 * Century is stored as century_xlsx in the database.
 */
export const DAT_ELIGIBLE_TEMPLATE_TYPES = [
  "aljex_big500",
  "aljex_spot",
  "vms_email",
  "semco_email",
  "adelphia_xlsx",
  "oldcastle_gsheet",
  "century_xlsx",
  "Century",
  "truckertools",
] as const;

/**
 * PostgREST `or()` filter: load is on the dispatch board for DAT purposes.
 * Includes `dispatch_status = 'open'` and legacy rows with null `dispatch_status` and booking `status = 'open'`
 * (matches dashboard NEW-card dispatch logic; excludes `pending` / `archived` dispatch).
 */
export const SUPABASE_FILTER_DAT_DISPATCH_BOARD =
  "dispatch_status.eq.open,and(dispatch_status.is.null,status.eq.open)";

/** Only these sources require complete origin/destination before DAT export. */
const DAT_EXPORT_REQUIRES_ORIGIN_DEST_TEMPLATE_TYPES = new Set<string>([
  "adelphia_xlsx",
  "oldcastle_gsheet",
  "aljex_big500",
  "vms_email",
  "aljex_spot",
  "semco_email",
]);

/**
 * Trucker Tools and Century are excluded — export even with sparse O/D. SEMCO and the named
 * sources above require full O/D. All other DAT-eligible types not in this set are also treated as
 * not requiring O/D (defensive).
 */
export function templateTypeRequiresOriginDestForDatExport(templateType: string | null | undefined): boolean {
  const t = templateType || "";
  return DAT_EXPORT_REQUIRES_ORIGIN_DEST_TEMPLATE_TYPES.has(t);
}

export function filterDatEligibleLoads(loads: Load[]): Load[] {
  return loads.filter((l) =>
    DAT_ELIGIBLE_TEMPLATE_TYPES.includes(
      l.template_type as (typeof DAT_ELIGIBLE_TEMPLATE_TYPES)[number],
    ),
  );
}

/**
 * Modal pending counts per source. Uses exact `count` queries (no 1000-row cap).
 * Filters: `dat_posted_at` null, `is_active`, dispatch board open (see `SUPABASE_FILTER_DAT_DISPATCH_BOARD`).
 */
export async function fetchDatPendingCountsBySource(
  supabase: SupabaseClient,
  opts: { role: string | null; impersonatedAgencyId: string | null },
): Promise<Record<DatExportSourceGroupId, number>> {
  const init: Record<DatExportSourceGroupId, number> = {
    big500: 0,
    spot: 0,
    vms: 0,
    semco: 0,
    adelphia: 0,
    oldcastle: 0,
    century: 0,
    truckertools: 0,
  };

  for (const g of DAT_EXPORT_SOURCE_GROUPS) {
    let q = supabase
      .from("loads")
      .select("*", { count: "exact", head: true })
      .in("template_type", [...g.templateTypes])
      .is("dat_posted_at", null)
      .eq("is_active", true)
      .or(SUPABASE_FILTER_DAT_DISPATCH_BOARD);

    if (opts.role === "super_admin" && opts.impersonatedAgencyId) {
      q = q.eq("agency_id", opts.impersonatedAgencyId);
    }

    const { count, error } = await q;
    if (error) throw error;
    init[g.id] = count ?? 0;
  }

  return init;
}

/** Pending loads for selected source groups (exportable rows only). */
export async function fetchDatPendingLoadsForSourceGroups(
  supabase: SupabaseClient,
  groupIds: DatExportSourceGroupId[],
  opts: { role: string | null; impersonatedAgencyId: string | null },
): Promise<Load[]> {
  const templateSet = new Set<string>();
  for (const id of groupIds) {
    const g = DAT_EXPORT_SOURCE_GROUPS.find((x) => x.id === id);
    if (g) for (const tt of g.templateTypes) templateSet.add(tt);
  }
  const types = [...templateSet];
  if (types.length === 0) return [];

  const hasTruckertools = types.includes("truckertools");
  const otherTypes = types.filter((t) => t !== "truckertools");
  const rows: Load[] = [];

  if (hasTruckertools) {
    let qtt = supabase
      .from("loads")
      .select("*")
      .eq("template_type", "truckertools")
      .is("dat_posted_at", null)
      .eq("is_active", true)
      .or(SUPABASE_FILTER_DAT_DISPATCH_BOARD)
      .order("ship_date", { ascending: true });

    if (opts.role === "super_admin" && opts.impersonatedAgencyId) {
      qtt = qtt.eq("agency_id", opts.impersonatedAgencyId);
    }

    const { data: ttData, error: ttError } = await qtt;
    if (ttError) throw ttError;
    rows.push(...((ttData || []) as Load[]));
  }

  if (otherTypes.length > 0) {
    let q = supabase
      .from("loads")
      .select("*")
      .in("template_type", otherTypes)
      .is("dat_posted_at", null)
      .eq("is_active", true)
      .or(SUPABASE_FILTER_DAT_DISPATCH_BOARD)
      .order("ship_date", { ascending: true });

    if (opts.role === "super_admin" && opts.impersonatedAgencyId) {
      q = q.eq("agency_id", opts.impersonatedAgencyId);
    }

    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data || []) as Load[]));
  }

  rows.sort((a, b) => {
    const sa = String(a.ship_date ?? "");
    const sb = String(b.ship_date ?? "");
    if (sa !== sb) return sa.localeCompare(sb);
    return String(a.id).localeCompare(String(b.id));
  });

  return rows.filter(isExportableLoad);
}

export async function fetchDatPendingLoadsForExport(
  supabase: SupabaseClient,
  opts: { role: string | null; impersonatedAgencyId: string | null },
): Promise<Load[]> {
  const allTypes = [...DAT_ELIGIBLE_TEMPLATE_TYPES];
  const otherTypes = allTypes.filter((t) => t !== "truckertools");
  const rows: Load[] = [];

  let qtt = supabase
    .from("loads")
    .select("*")
    .eq("template_type", "truckertools")
    .is("dat_posted_at", null)
    .eq("is_active", true)
    .or(SUPABASE_FILTER_DAT_DISPATCH_BOARD)
    .order("ship_date", { ascending: true });
  if (opts.role === "super_admin" && opts.impersonatedAgencyId) {
    qtt = qtt.eq("agency_id", opts.impersonatedAgencyId);
  }
  const { data: ttData, error: ttError } = await qtt;
  if (ttError) throw ttError;
  rows.push(...((ttData || []) as Load[]));

  let q = supabase
    .from("loads")
    .select("*")
    .in("template_type", otherTypes)
    .is("dat_posted_at", null)
    .eq("is_active", true)
    .or(SUPABASE_FILTER_DAT_DISPATCH_BOARD)
    .order("ship_date", { ascending: true });
  if (opts.role === "super_admin" && opts.impersonatedAgencyId) {
    q = q.eq("agency_id", opts.impersonatedAgencyId);
  }
  const { data, error } = await q;
  if (error) throw error;
  rows.push(...((data || []) as Load[]));

  rows.sort((a, b) => {
    const sa = String(a.ship_date ?? "");
    const sb = String(b.ship_date ?? "");
    if (sa !== sb) return sa.localeCompare(sb);
    return String(a.id).localeCompare(String(b.id));
  });

  return rows.filter(isExportableLoad);
}

/** In-memory pending filter (e.g. when only dashboard `loads` are available). Same rules as fetch, minus inactive rows not in `loads`. */
export function getDatPendingLoads(loads: Load[]): Load[] {
  return loads.filter((load) => {
    if (
      !DAT_ELIGIBLE_TEMPLATE_TYPES.includes(
        load.template_type as (typeof DAT_ELIGIBLE_TEMPLATE_TYPES)[number],
      )
    ) {
      return false;
    }
    if ((load as { dat_posted_at?: string | null }).dat_posted_at != null) return false;
    if (load.is_active === false) return false;
    const onDispatchBoard =
      load.dispatch_status === "open" ||
      (load.dispatch_status == null && load.status === "open");
    if (!onDispatchBoard) return false;
    return isExportableLoad(load);
  });
}

// Official DAT bulk upload template columns only — CSV rows are built exclusively from
// mapLoadToDAT → these headers. rate_raw, customer_invoice_total, target_pay, and max_pay
// are never written to DAT export (app or scripts/dat-export.py).
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

/** DAT Contact Method* column — label only; dispatch phone goes in Comment. */
const DAT_CONTACT_METHOD = "primary phone";
/** DAT Comment column — dispatch phone for call routing. */
const DAT_COMMENT_PHONE = "941-621-2397";

/** DAT requires a weight; use 1 lbs when load weight is missing or zero. */
function datExportWeightLbs(weightLbs: number | null | undefined): string {
  const n = weightLbs == null ? NaN : Number(weightLbs);
  if (!Number.isFinite(n) || n <= 0) return "1";
  return String(Math.round(n));
}

/**
 * Normalize equipment to DAT single-letter codes (F / V / R).
 * Unknown or empty → F (flatbed).
 */
function normalizeDatEquipmentCode(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return "F";

  const exact: Record<string, string> = {
    FSD: "F",
    FSB: "F",
    FT: "F",
    VR: "V",
    CN: "V",
  };
  if (exact[s]) return exact[s];

  const c0 = s[0];
  if (c0 === "F") return "F";
  if (c0 === "V") return "V";
  if (c0 === "R") return "R";

  return "F";
}

// Map trailer type to DAT equipment code (word hints + raw codes), then normalize for CSV.
// templateType is used to default Adelphia and VMS to Flatbed
export function mapEquipmentCode(trailerType: string | null | undefined, templateType?: string | null): string {
  let raw = "";
  if (!trailerType?.trim()) {
    if (
      templateType === "adelphia_xlsx" ||
      templateType === "vms_email" ||
      templateType === "semco_email" ||
      templateType === "oldcastle_gsheet" ||
      templateType === "century_xlsx" ||
      templateType === "Century" ||
      templateType === "aljex_big500" ||
      templateType === "aljex_spot" ||
      templateType === "truckertools"
    ) {
      raw = "F";
    }
  } else {
    const type = trailerType.toLowerCase();
    if (type.includes("van") || type.includes("dry")) raw = "V";
    else if (type.includes("reefer") || type.includes("refriger")) raw = "R";
    else if (type.includes("flat") || type.includes("step")) raw = "F";
    else if (type.includes("tanker")) raw = "T";
    else if (type.includes("hopper")) raw = "HB";
    else if (type.includes("lowboy")) raw = "LB";
    else if (type.includes("double")) raw = "DD";
    else if (type.includes("container")) raw = "C";
    else raw = trailerType.trim();
  }
  return normalizeDatEquipmentCode(raw);
}

// Clean state field: strip anything after "/" (e.g. "IN/CHICAGO" → "IN")
function cleanState(state: string | null | undefined): string {
  if (!state) return "";
  return state.split("/")[0].trim();
}

/**
 * If city looks like "IVYLAND.PA" and state is empty, split into city + 2-letter state.
 */
function parseCityStateFromDotEmbedded(
  cityRaw: string | null | undefined,
  stateRaw: string | null | undefined,
): { city: string; state: string } {
  let city = (cityRaw ?? "").trim();
  const state = (stateRaw ?? "").trim();

  if (city && !state) {
    const idx = city.lastIndexOf(".");
    if (idx > 0 && idx < city.length - 1) {
      const suffix = city.slice(idx + 1).trim();
      if (/^[A-Za-z]{2}$/.test(suffix)) {
        return { city: city.slice(0, idx).trim(), state: suffix.toUpperCase() };
      }
    }
  }
  return { city, state };
}

function datExportDestinationResolved(load: Load): { city: string; state: string } {
  const { city, state } = parseCityStateFromDotEmbedded(load.dest_city, load.dest_state);
  return { city, state: cleanState(state) };
}

// Check if a load is a valid exportable load (not a template note/instruction row)
export function isExportableLoad(load: Load): boolean {
  if (load.template_type === "truckertools") {
    return true;
  }
  const city = (load.pickup_city || "").toUpperCase();
  if (city.startsWith("PICK UP") || city.startsWith("NOTE") || city.startsWith("***")) return false;
  if (!templateTypeRequiresOriginDestForDatExport(load.template_type)) {
    return true;
  }
  if (!load.pickup_city && !load.dest_city) return false;
  const dest = datExportDestinationResolved(load);
  if (!dest.city.trim() || !dest.state.trim()) return false;
  return true;
}

// Map a load to DAT row format
function mapLoadToDAT(load: Load): Record<string, string> {
  // Length: use trailer_footage if available, default to 48 (standard flatbed) if missing
  const lengthValue = load.trailer_footage ? String(load.trailer_footage) : "48";

  // Use current date for first two columns
  const currentDate = getCurrentDate();
  
  const weightValue = datExportWeightLbs(load.weight_lbs);

  const origin = parseCityStateFromDotEmbedded(load.pickup_city, load.pickup_state);
  const dest = datExportDestinationResolved(load);

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
    "Contact Method*": DAT_CONTACT_METHOD,
    "Origin City*": origin.city,
    "Origin State*": cleanState(origin.state),
    // R / U / W / X: keep headers; fixed values per DAT template spec
    "Origin Postal Code": "",
    "Destination City*": dest.city,
    "Destination State*": dest.state,
    "Destination Postal Code": "",
    "Comment": DAT_COMMENT_PHONE,
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

/** Primary key for last DAT export time (also migrates legacy `dat_last_export_timestamp`). */
export const LAST_DAT_EXPORT_STORAGE_KEY = "lastDatExport";
const LEGACY_DAT_EXPORT_TIMESTAMP_KEY = "dat_last_export_timestamp";

function readLastDatExportIso(): string | null {
  if (typeof localStorage === "undefined") return null;
  return (
    localStorage.getItem(LAST_DAT_EXPORT_STORAGE_KEY) ??
    localStorage.getItem(LEGACY_DAT_EXPORT_TIMESTAMP_KEY)
  );
}

/** Dismissal time for admin DAT pending banner (ISO); banner may return after 30 min if still pending. */
export const DAT_REMINDER_DISMISS_KEY = "dat_pending_reminder_dismissed_at";

/** Last time we played sound + desktop notification for DAT reminder (ISO). */
export const DAT_REMINDER_NUDGE_KEY = "dat_reminder_last_nudge_at";

/** True when current time in America/Chicago is 7:55–17:00 inclusive. */
export function isDatReminderBusinessHoursCentral(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const mins = hour * 60 + minute;
  return mins >= 7 * 60 + 55 && mins <= 17 * 60;
}

export function minutesSinceLastDatExport(): number {
  if (typeof localStorage === "undefined") return 1e6;
  const ts = readLastDatExportIso();
  if (!ts) return 1e6;
  return (Date.now() - new Date(ts).getTime()) / 60_000;
}

export function datReminderDismissedWithinMinutes(minutes: number): boolean {
  if (typeof localStorage === "undefined") return false;
  const d = localStorage.getItem(DAT_REMINDER_DISMISS_KEY);
  if (!d) return false;
  return Date.now() - new Date(d).getTime() < minutes * 60_000;
}

export async function fetchDatPendingTotalForReminder(
  supabase: SupabaseClient,
  opts: { role: string | null; impersonatedAgencyId: string | null },
): Promise<number> {
  let q = supabase
    .from("loads")
    .select("id", { count: "exact", head: true })
    .in("template_type", [...DAT_ELIGIBLE_TEMPLATE_TYPES])
    .is("dat_posted_at", null)
    .eq("is_active", true)
    .or(SUPABASE_FILTER_DAT_DISPATCH_BOARD);

  if (opts.role === "super_admin" && opts.impersonatedAgencyId) {
    q = q.eq("agency_id", opts.impersonatedAgencyId);
  }

  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

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
  const lastExport = readLastDatExportIso();
  if (!lastExport) return loads;
  const lastExportDate = new Date(lastExport);
  return loads.filter(load => new Date(load.created_at) > lastExportDate);
}

// Save the current timestamp as last export time
export function markDATExportComplete(): void {
  const now = new Date().toISOString();
  localStorage.setItem(LAST_DAT_EXPORT_STORAGE_KEY, now);
  try {
    localStorage.removeItem(LEGACY_DAT_EXPORT_TIMESTAMP_KEY);
  } catch {
    // ignore
  }
}

// Get the last export timestamp for display
export function getLastDATExportTimestamp(): string | null {
  if (typeof localStorage === "undefined") return null;
  return readLastDatExportIso();
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
