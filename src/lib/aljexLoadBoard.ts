import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

/** Stored on loads ingested from Aljex scrape / bookmarklet / sync (not manual Dispatch Status from exports). */
export const ALJEX_SCRAPED_DISPATCH_STATUS = "available" as const;

/**
 * Reads an Aljex scrape / CSV row status (load board OPEN vs COVERED).
 * Checks common column names from bookmarklet or CSV exports.
 */
export function getAljexScrapeRowStatus(row: Record<string, string>): string {
  const raw =
    row["Status"] ??
    row["Load Status"] ??
    row["St"] ??
    "";
  return String(raw).trim().toUpperCase();
}

/**
 * Scrape / import filter: include only OPEN rows. Excludes COVERED (and anything else).
 * Rows with no status column are kept so older CSVs without Status still import.
 */
export function scrapeAljexLoadsRowPassesStatusFilter(row: Record<string, string>): boolean {
  const s = getAljexScrapeRowStatus(row);
  if (!s) return true;
  return s === "OPEN";
}

/** Templates that use the dispatcher / ElevenLabs call script UX. */
export function isAljexCallScriptLoad(templateType: string): boolean {
  return templateType === "aljex_big500" || templateType === "aljex_spot";
}

/** Small secondary badge for Aljex Big 500 / Spot rows in the load board CLIENT column. */
export function getAljexTemplateBadgeLabel(templateType: string): string | null {
  if (templateType === "aljex_big500") return "Big 500";
  if (templateType === "aljex_spot") return "Spot";
  return null;
}

/** Primary CLIENT column label (load board + filters). */
export function getLoadBoardClientPrimaryLabel(templateType: string): string {
  switch (templateType) {
    case "adelphia_xlsx":
      return "Adelphia";
    case "vms_email":
      return "VMS";
    case "oldcastle_gsheet":
      return "Oldcastle";
    case "aljex_spot":
      return "Spot Loads";
    case "aljex_big500":
    case "aljex_flat":
      return "Aljex";
    default:
      return templateType.startsWith("aljex") ? "Aljex" : templateType;
  }
}

function formatScriptMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n)) || Number(n) <= 0) return "TBD";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Plain-text script for ElevenLabs / human dispatchers (aljex_big500, aljex_spot).
 */
export function buildAljexDispatcherCallScript(load: Load): string {
  const inv = formatScriptMoney(load.customer_invoice_total);
  const target = formatScriptMoney(load.target_pay);
  const max = formatScriptMoney(load.max_pay);
  const lines: string[] = [
    `This load pays ${inv}. We can offer up to ${target} and max out at ${max}.`,
  ];

  if (load.is_per_ton && load.rate_raw != null && Number(load.rate_raw) > 0) {
    lines.push(`Rate: $${Number(load.rate_raw).toLocaleString()}/ton`);
  }

  const pc = load.pickup_city?.trim() || "";
  const ps = load.pickup_state?.trim() || "";
  const dc = load.dest_city?.trim() || "";
  const ds = load.dest_state?.trim() || "";
  lines.push(`Route: ${pc || "—"}, ${ps || "—"} → ${dc || "—"}, ${ds || "—"}`);

  lines.push(`Equipment: ${load.trailer_type?.trim() || "—"}`);

  const w =
    load.weight_lbs != null && Number(load.weight_lbs) > 0
      ? `${Number(load.weight_lbs).toLocaleString()} lbs`
      : "—";
  lines.push(`Weight: ${w}`);

  const comm = load.commodity?.trim();
  if (comm) lines.push(`Commodity: ${comm}`);

  return lines.join("\n");
}
