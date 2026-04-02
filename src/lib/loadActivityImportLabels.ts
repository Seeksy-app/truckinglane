/** Labels for load import template_type (email import + file upload batches). */
const IMPORT_TEMPLATE_LABELS: Record<string, string> = {
  adelphia_xlsx: "Adelphia Import",
  vms_email: "VMS Import",
  century_xlsx: "Century Import",
  Century: "Century Import",
  allied_xlsx: "Allied Import",
  semco_email: "SEMCO Email (PDF)",
  aljex_big500: "Big 500 Import",
  aljex_spot: "Aljex Spot Sync",
  truckertools: "Trucker Tools Sync",
  oldcastle_gsheet: "Oldcastle Sync",
};

export type ImportRunRow = { template_type: string; created_at: string };
export type LoadTsRow = { template_type: string; updated_at: string };

export function labelFromTemplateType(templateType: string): string {
  return IMPORT_TEMPLATE_LABELS[templateType] ?? "Load Import";
}

/** Extract template key from edge-function messages like "Accepted for century_xlsx; …". */
export function templateTypeFromErrorMessage(msg: string | null): string | null {
  if (!msg) return null;
  const m = msg.match(
    /\b(adelphia_xlsx|vms_email|century_xlsx|Century|allied_xlsx|semco_xlsx|semco_email|oldcastle_gsheet|aljex_big500|aljex_spot|aljex_flat|truckertools)\b/,
  );
  return m?.[1] ?? null;
}

/** Latest load_import_run at or before this log, within a few minutes (run is inserted before success log). */
export function pickTemplateFromRun(logCreatedAt: string, runs: ImportRunRow[]): string | null {
  const logTs = new Date(logCreatedAt).getTime();
  const candidates = runs.filter((r) => {
    const rt = new Date(r.created_at).getTime();
    return rt <= logTs && logTs - rt < 180_000;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return candidates[0].template_type;
}

/** Infer template_type from loads touched in the same sync window (e.g. Google Sheets sync with no import run). */
export function pickTemplateFromLoads(logCreatedAt: string, loads: LoadTsRow[]): string | null {
  const t = new Date(logCreatedAt).getTime();
  const windowRows = loads.filter((l) => {
    const u = new Date(l.updated_at).getTime();
    return u >= t - 25_000 && u <= t + 120_000;
  });
  if (windowRows.length === 0) return null;
  const counts = new Map<string, number>();
  for (const row of windowRows) {
    counts.set(row.template_type, (counts.get(row.template_type) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestC = 0;
  for (const [k, v] of counts) {
    if (v > bestC) {
      bestC = v;
      best = k;
    }
  }
  return best;
}

/** Display-only labels for raw_headers.source (stored values unchanged). */
const LOAD_ACTIVITY_SOURCE_DISPLAY: Record<string, string> = {
  "openclaw-upload": "Oldcastle Sync",
};

function displayLoadActivitySource(source: string): string {
  const key = source.trim();
  return LOAD_ACTIVITY_SOURCE_DISPLAY[key] ?? key;
}

function readTemplateFromRawHeaders(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const tt = (raw as { template_type?: unknown }).template_type;
  return typeof tt === "string" && tt.trim() ? tt.trim() : null;
}

export function resolveImportTemplateType(
  log: {
    created_at: string;
    sender_email: string;
    raw_headers: unknown;
    error_message: string | null;
  },
  runs: ImportRunRow[],
  loadsWindow: LoadTsRow[],
): string | null {
  const sender = log.sender_email.toLowerCase();
  if (
    sender.includes("daily-archive") ||
    sender.startsWith("dat-csv-export@") ||
    sender.startsWith("dat-export@")
  ) {
    return null;
  }

  const fromRaw = readTemplateFromRawHeaders(log.raw_headers);
  if (fromRaw) return fromRaw;

  const fromErr = templateTypeFromErrorMessage(log.error_message);
  if (fromErr) return fromErr;

  const fromRun = pickTemplateFromRun(log.created_at, runs);
  if (fromRun) return fromRun;

  return pickTemplateFromLoads(log.created_at, loadsWindow);
}

export function resolveImportActivityLabel(
  log: Parameters<typeof resolveImportTemplateType>[0],
  runs: ImportRunRow[],
  loadsWindow: LoadTsRow[],
  senderFallbackLabel: (senderEmail: string) => string,
): string {
  const sender = log.sender_email.toLowerCase();
  if (sender.includes("daily-archive")) return "Nightly Clear";
  if (sender.startsWith("dat-csv-export@")) return "DAT CSV Export";
  if (sender.includes("dat-export")) return "DAT Export";

  const rh = log.raw_headers;
  if (
    rh &&
    typeof rh === "object" &&
    !Array.isArray(rh) &&
    typeof (rh as { source?: unknown }).source === "string" &&
    (rh as { source: string }).source.trim()
  ) {
    return displayLoadActivitySource((rh as { source: string }).source);
  }

  const tt = resolveImportTemplateType(log, runs, loadsWindow);
  if (tt) return labelFromTemplateType(tt);

  return senderFallbackLabel(log.sender_email);
}
