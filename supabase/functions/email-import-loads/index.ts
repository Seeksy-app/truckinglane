import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Lowercased full addresses allowed to import when agency domain whitelist would otherwise reject. */
const EDGE_EXTRA_ALLOWED_SENDER_EMAILS = new Set<string>([
  "stephen@dltransport.com",
  "appletonab@gmail.com",
]);

const INBOUND_DEDUPE_WINDOW_MS = 60 * 60 * 1000;

/** Dedupe store key: same sender + same attachment filename(s) within the window → skip. */
function inboundDedupeSenderFilenameKey(senderLower: string, filenamePart: string): string {
  const fn = String(filenamePart ?? "").trim().toLowerCase().slice(0, 800);
  return `fn:${senderLower}|${fn}`;
}

function centuryPdfDedupeFilenamePart(
  pdfs: { filename?: string; id?: string }[],
): string {
  const parts = pdfs.map((a, i) => {
    const f = String(a.filename ?? "").trim().toLowerCase();
    if (f) return f;
    return `id:${String(a.id ?? `idx${i}`)}`;
  });
  parts.sort();
  return `pdfs:${parts.join("\x1f")}`;
}

async function responseIfDuplicateSenderFilenameWithinHour(
  supabase: ReturnType<typeof createClient>,
  payloadHash: string,
  logCtx: {
    agency_id: string;
    sender_email: string;
    subject: string;
    raw_headers: unknown;
  },
): Promise<Response | null> {
  const cutoff = new Date(Date.now() - INBOUND_DEDUPE_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("email_import_attachment_dedupe")
    .select("id")
    .eq("payload_hash", payloadHash)
    .gte("created_at", cutoff)
    .limit(1);
  if (error) {
    console.error("Inbound dedupe lookup error:", error);
    return null;
  }
  if (data && data.length > 0) {
    await supabase.from("email_import_logs").insert({
      agency_id: logCtx.agency_id,
      sender_email: logCtx.sender_email,
      subject: logCtx.subject,
      status: "received",
      imported_count: 0,
      error_message: "duplicate skipped",
      raw_headers: logCtx.raw_headers,
    });
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

async function recordSuccessfulInboundDedupe(
  supabase: ReturnType<typeof createClient>,
  fullKey: string,
): Promise<void> {
  const { error } = await supabase.from("email_import_attachment_dedupe").insert({ payload_hash: fullKey });
  if (error) console.error("Inbound dedupe insert error:", error);
  const pruneBefore = new Date(Date.now() - 2 * INBOUND_DEDUPE_WINDOW_MS).toISOString();
  await supabase.from("email_import_attachment_dedupe").delete().lt("created_at", pruneBefore);
}

/** Century PDF import: subject/body must contain "century" (case-insensitive). Not "loads" alone — avoids mis-routing. */
function subjectMatchesCenturyKeyword(subject: string): boolean {
  const s = String(subject ?? "").normalize("NFKC").toLowerCase();
  return s.includes("century");
}

function resolveInboundEmailSubject(
  payload: Record<string, unknown>,
  emailHeaders: Record<string, unknown>,
): string {
  const data = payload.data as Record<string, unknown> | undefined;
  const email = payload.email as Record<string, unknown> | undefined;
  const dataHeaders = data?.headers as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    payload.subject,
    data?.subject,
    email?.subject,
    emailHeaders?.subject,
    emailHeaders?.Subject,
    dataHeaders?.subject,
    dataHeaders?.Subject,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

// ============= XLSX PARSING (copied from import-loads) =============
function parseXLSX(buffer: ArrayBuffer, sheetName: string, headerRow: number): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  
  const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    console.error("Sheet not found:", sheetName, "Available:", workbook.SheetNames);
    return [];
  }
  
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRow - 1, c: col });
    const cell = sheet[cellAddress];
    headers.push(cell ? String(cell.v).trim() : `Column${col}`);
  }
  
  const rows: Record<string, string>[] = [];
  for (let row = headerRow; row <= range.e.r; row++) {
    const rowData: Record<string, string> = {};
    let hasData = false;
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      const header = headers[col - range.s.c];
      const value = cell ? String(cell.v).trim() : "";
      
      if (value) hasData = true;
      rowData[header] = value;
      
      const colLetter = XLSX.utils.encode_col(col);
      rowData[`_col_${colLetter}`] = value;
    }
    
    if (hasData) {
      rows.push(rowData);
    }
  }
  
  return rows;
}

// ============= HELPER FUNCTIONS =============
function parseNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const cleaned = String(value).replace(/[$,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const str = String(value).trim();
  
  const parts = str.split(/[/-]/);
  if (parts.length === 3) {
    const [m, d, y] = parts;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  
  const serial = parseFloat(str);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  
  return null;
}

async function countNewUpdatedForImport(
  supabase: ReturnType<typeof createClient>,
  agencyId: string,
  templateType: string,
  loadNumbers: string[],
): Promise<{ new: number; updated: number }> {
  if (loadNumbers.length === 0) return { new: 0, updated: 0 };
  const { data, error } = await supabase
    .from("loads")
    .select("load_number")
    .eq("agency_id", agencyId)
    .eq("template_type", templateType)
    .in("load_number", loadNumbers);
  if (error) console.error("countNewUpdatedForImport:", error);
  const existing = new Set((data ?? []).map((r: { load_number: string }) => String(r.load_number)));
  const newC = loadNumbers.filter((n) => !existing.has(String(n))).length;
  return { new: newC, updated: loadNumbers.length - newC };
}

/** Active loads after import — for load_activity_logs / email_import_logs.raw_headers.total_count */
async function countActiveLoadsForTemplate(
  supabase: ReturnType<typeof createClient>,
  agencyId: string,
  templateType: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("loads")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("template_type", templateType)
    .eq("is_active", true);
  if (error) {
    console.error("countActiveLoadsForTemplate:", error);
    return 0;
  }
  return count ?? 0;
}

function mergeImportActivityHeaders(
  emailHeaders: unknown,
  breakdown: {
    template_type: string;
    new: number;
    updated: number;
    dupes_dropped: number;
    removed?: number;
    supports_removal: boolean;
    /** Canonical label for load_activity_logs.meta (trigger merges raw_headers) */
    source?: string;
    /** Explicit counts for load_activity_logs consumers (mirror new/updated/removed) */
    new_count?: number;
    updated_count?: number;
    removed_count?: number;
    /** Total active loads for this template after import */
    total_count?: number;
  },
): Record<string, unknown> {
  const base =
    emailHeaders && typeof emailHeaders === "object" && !Array.isArray(emailHeaders)
      ? { ...(emailHeaders as Record<string, unknown>) }
      : {};
  base.template_type = breakdown.template_type;
  base.new = breakdown.new;
  base.updated = breakdown.updated;
  base.dupes_dropped = breakdown.dupes_dropped;
  base.duplicates_removed = breakdown.dupes_dropped;
  base.supports_removal = breakdown.supports_removal;
  if (breakdown.supports_removal && typeof breakdown.removed === "number" && breakdown.removed > 0) {
    base.removed = breakdown.removed;
    base.archived = breakdown.removed;
  }
  if (typeof breakdown.source === "string" && breakdown.source.trim()) {
    base.source = breakdown.source.trim();
  }
  if (typeof breakdown.new_count === "number") base.new_count = breakdown.new_count;
  if (typeof breakdown.updated_count === "number") base.updated_count = breakdown.updated_count;
  if (typeof breakdown.removed_count === "number") base.removed_count = breakdown.removed_count;
  if (typeof breakdown.total_count === "number") base.total_count = breakdown.total_count;
  return base;
}

function parseTarpRequired(value: string | undefined | null): boolean {
  if (!value) return false;
  const upper = String(value).toUpperCase().trim();
  return ["Y", "YES", "TRUE", "1"].includes(upper);
}

function calculateRateFields(rateRaw: number | null, weightLbs: number | null, isPerTon: boolean) {
  if (rateRaw === null || rateRaw === 0) {
    return {
      rate_raw: null,
      is_per_ton: isPerTon,
      customer_invoice_total: 0,
      target_pay: 0,
      target_commission: 0,
      max_pay: 0,
      max_commission: 0,
      commission_target_pct: 0.20,
      commission_max_pct: 0.15,
    };
  }
  
  const rate = rateRaw;
  const weight = weightLbs || 0;
  const weightTons = weight / 2000;
  
  let invoiceTotal = 0;
  if (isPerTon) {
    if (weightTons > 0) {
      invoiceTotal = Math.round(rate * weightTons);
    }
  } else {
    invoiceTotal = Math.round(rate);
  }
  
  const targetPay = Math.round(invoiceTotal * 0.80);
  const targetCommission = Math.round(invoiceTotal * 0.20);
  const maxPay = Math.round(invoiceTotal * 0.85);
  const maxCommission = Math.round(invoiceTotal * 0.15);
  
  return {
    rate_raw: rate,
    is_per_ton: isPerTon,
    customer_invoice_total: invoiceTotal,
    target_pay: targetPay,
    target_commission: targetCommission,
    max_pay: maxPay,
    max_commission: maxCommission,
    commission_target_pct: 0.20,
    commission_max_pct: 0.15,
  };
}

// ============= CENTURY PDF (Claude) =============
const CENTURY_CLAUDE_MODEL = "claude-sonnet-4-5";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Century: email received day → pickup is next calendar day (UTC). */
function centuryPickupDateFromEmailReceived(receivedIso: string): string {
  const d = new Date(receivedIso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

async function centuryHash3(pickupSt: string, destSt: string, salt: string): Promise<string> {
  const enc = new TextEncoder().encode(`${pickupSt}|${destSt}|${salt}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 3).toUpperCase();
}

async function fetchInboundPdfAttachmentBuffer(
  emailId: string | undefined,
  attachment: { id?: string; content?: string; filename?: string },
  resendApiKey: string | undefined,
): Promise<ArrayBuffer> {
  if (attachment.content) {
    const fileContent = decodeBase64(attachment.content);
    return new Uint8Array(fileContent).buffer as ArrayBuffer;
  }
  if (!attachment.id || !resendApiKey || !emailId) {
    throw new Error("PDF attachment needs content or Resend fetch (id + email_id + API key)");
  }
  const listResponse = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}/attachments`,
    { headers: { Authorization: `Bearer ${resendApiKey}` } },
  );
  if (!listResponse.ok) throw new Error(`Resend attachments list: ${listResponse.status}`);
  const attachmentsList = await listResponse.json();
  const attachmentData = attachmentsList.data?.find((a: { id: string }) => a.id === attachment.id);
  if (!attachmentData?.download_url) throw new Error("Attachment download_url not found");
  const fileResponse = await fetch(attachmentData.download_url);
  if (!fileResponse.ok) throw new Error(`Download PDF: ${fileResponse.status}`);
  return await fileResponse.arrayBuffer();
}

type CenturyPdfClaudeExtract = {
  load_number: string;
  reference_number: string;
  pickup_city: string;
  pickup_state: string;
  dest_city: string;
  dest_state: string;
  weight_tons: number;
  rate_per_ton: number;
  pickup_date: string | null;
  destination_company: string;
  contains_bales: boolean;
};

async function extractCenturyPdfWithClaude(
  pdfBase64: string,
  anthropicKey: string,
): Promise<CenturyPdfClaudeExtract> {
  const body = {
    model: CENTURY_CLAUDE_MODEL,
    max_tokens: 1800,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: `You are parsing a freight load PDF (Century / scrap metal). Return ONLY valid JSON (no markdown) with these keys:
{"load_number":"","reference_number":"","pickup_city":"","pickup_state":"2-letter US state","dest_city":"","dest_state":"2-letter US state","weight_tons":0,"rate_per_ton":0,"pickup_date":null,"destination_company":"","contains_bales":false}

load_number / reference_number: shipment or reference ID as printed (prefer the clearest primary load ID). Use empty string if not found.
weight_tons: shipment weight in US tons (2000 lb tons), numeric only.
rate_per_ton: dollars per ton from patterns like $85/NT or $85 / NT (number only).
pickup_date: string "YYYY-MM-DD" if a pickup or ship date is clearly shown on the document, otherwise null.
destination_company: consignee / mill / recycler at destination.
contains_bales: true if the word BALES appears anywhere (any case), else false.`,
          },
        ],
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      'x-api-key': anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return JSON");
  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const tons = Number(parsed.weight_tons);
  const rpt = Number(parsed.rate_per_ton);
  const pickupDateRaw = parsed.pickup_date;
  const pickupDate =
    pickupDateRaw === null || pickupDateRaw === undefined
      ? null
      : String(pickupDateRaw).trim() || null;
  return {
    load_number: String(parsed.load_number ?? "").trim(),
    reference_number: String(parsed.reference_number ?? "").trim(),
    pickup_city: String(parsed.pickup_city ?? "").trim(),
    pickup_state: String(parsed.pickup_state ?? "").trim().toUpperCase().slice(0, 2),
    dest_city: String(parsed.dest_city ?? "").trim(),
    dest_state: String(parsed.dest_state ?? "").trim().toUpperCase().slice(0, 2),
    weight_tons: Number.isFinite(tons) ? tons : 0,
    rate_per_ton: Number.isFinite(rpt) ? rpt : 0,
    pickup_date: pickupDate,
    destination_company: String(parsed.destination_company ?? "").trim(),
    contains_bales: Boolean(parsed.contains_bales),
  };
}

function sanitizeCenturyLoadNumberFromPdf(loadNum: string, refNum: string): string {
  const primary = String(loadNum ?? "").trim();
  const secondary = String(refNum ?? "").trim();
  const raw = primary || secondary;
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").replace(/[\r\n\t]/g, "").slice(0, 120);
}

// ============= POST LOADS TO X HELPER =============
async function postLoadsToX(loads: Record<string, unknown>[]): Promise<void> {
  const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY");
  if (!UPLOAD_POST_API_KEY) {
    console.log("UPLOAD_POST_API_KEY not configured, skipping X posting");
    return;
  }
  
  console.log(`Posting ${loads.length} loads to X via Upload Post`);
  
  // Only post first 5 loads to avoid rate limiting
  const loadsToPost = loads.slice(0, 5);
  
  for (const load of loadsToPost) {
    try {
      const postText = formatLoadForX(load);
      console.log(`Posting load ${load.load_number} to X`);
      
      const formData = new FormData();
      formData.append("user", "@TruckingLane");
      formData.append("platforms", "x");
      formData.append("text", postText);

      const response = await fetch("https://api.upload-post.com/api/upload_text", {
        method: "POST",
        headers: {
          "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`X post failed for ${load.load_number}: ${response.status} - ${errorText}`);
      } else {
        console.log(`Successfully posted load ${load.load_number} to X`);
      }
      
      // Delay between posts to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`Error posting load ${load.load_number} to X:`, err);
    }
  }
}

function formatLoadForX(load: Record<string, unknown>): string {
  const lines: string[] = [];
  
  lines.push(`🚛 LOAD #${load.load_number}`);
  lines.push("");
  
  // Route
  if (load.ship_date) {
    lines.push(`📅 ${load.ship_date}`);
  }
  if (load.pickup_city && load.pickup_state) {
    lines.push(`📍 ${load.pickup_city}, ${load.pickup_state}`);
  }
  if (load.dest_city && load.dest_state) {
    lines.push(`➡️ ${load.dest_city}, ${load.dest_state}`);
  }
  lines.push("");
  
  // Equipment
  const equipmentParts: string[] = [];
  if (load.trailer_type) {
    equipmentParts.push(String(load.trailer_type));
  }
  if (load.trailer_footage) {
    equipmentParts.push(`${load.trailer_footage}ft`);
  }
  if (equipmentParts.length > 0) {
    lines.push(`🔧 ${equipmentParts.join(" | ")}`);
  }
  
  if (load.weight_lbs) {
    lines.push(`⚖️ ${Number(load.weight_lbs).toLocaleString()} lbs`);
  }
  if (load.commodity) {
    lines.push(`📦 ${load.commodity}`);
  }
  lines.push("");
  
  lines.push("📞 Call for rates!");
  lines.push("#trucking #flatbed #freight #loads");
  
  return lines.join("\n");
}

function generateLoadCallScript(load: Record<string, unknown>): string {
  const loadNumber = load.load_number || "";
  const pickupRaw = load.pickup_location_raw || "";
  const destRaw = load.dest_location_raw || "";
  const deliveryDate = load.ship_date || load.delivery_date || "TBD";
  const weightLbs = load.weight_lbs || "n/a";
  const lengthFt = load.trailer_footage || "n/a";
  const tarpRequired = load.tarp_required ? "Yes" : "No";
  const isPerTon = load.is_per_ton;
  const rate = isPerTon ? load.rate_raw : load.rate_raw;
  const rateStr = isPerTon ? `$${rate}/ton` : `$${rate} flat`;
  const invoiceTotal = load.customer_invoice_total;
  const invoiceStr = invoiceTotal ? `$${Number(invoiceTotal).toFixed(2)}` : "n/a";
  const notes = load.commodity || load.notes || "";
  
  return `Load ${loadNumber}: Pickup ${pickupRaw}. Deliver ${destRaw}. Delivery ${deliveryDate}. Weight ${weightLbs} lbs. Length ${lengthFt} ft. Tarp ${tarpRequired}. Rate ${rateStr}. Invoice est ${invoiceStr}. Notes: ${notes}`;
}

// ============= VMS EMAIL BODY PARSER =============

// Generate a simple hash for deterministic load number generation
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex string, padded to 8 chars
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
}

function parseVMSEmailBody(body: string, agencyId: string): Record<string, unknown>[] {
  const loads: Record<string, unknown>[] = [];
  
  // Stop parsing when we hit reply chain markers to avoid processing historical data
  // Common patterns: "On Mon, Feb 3, 2026 at 10:30 AM ... wrote:", "> quoted text", "From:", "Sent:"
  const replyMarkers = [
    /^On\s+\w+,\s+\w+\s+\d+,?\s+\d+\s+at\s+\d+:\d+\s*[AP]M/i, // "On Mon, Feb 3, 2026 at 10:30 AM"
    /^On\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i, // "On 2/3/2026"
    /^From:\s+/i, // "From: someone@email.com"
    /^Sent:\s+/i, // "Sent: Monday, February 3"
    /^-{3,}\s*Original Message/i, // "--- Original Message ---"
    /^>{1,2}\s/, // "> quoted text" or ">> double quoted"
    /wrote:$/i, // "John Doe wrote:"
  ];
  
  const rawLines = body.split('\n');
  const filteredLines: string[] = [];
  
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    
    // Check if this line starts a reply chain
    const isReplyMarker = replyMarkers.some(pattern => pattern.test(line));
    if (isReplyMarker) {
      console.log("VMS parser: Stopping at reply marker:", line.substring(0, 50));
      break; // Stop processing - everything after is old data
    }
    
    filteredLines.push(line);
  }
  
  console.log(`VMS parser: Processing ${filteredLines.length} lines (stopped before reply chain)`);
  const lines = filteredLines;
  
  for (let line of lines) {
    // Strip Gmail bold formatting (asterisks around text like *2 - City, ST*) 
    line = line.replace(/^\*+/, '').replace(/\*+$/, '').trim();
    
    // Match pattern: "2 - Charleston, SC - cars - Jackson, Tn $1700"
    // Also handles "$1400" without space before "$" and notes after rate
    // Format: COUNT - PICKUP_CITY, ST - COMMODITY - DEST_CITY, ST $RATE [- NOTES]
    // The regex handles typos like "Jackson,. TN" (extra period/chars between comma and state)
    const match = line.match(/^(\d+)\s*-\s*([^,]+),\s*\.?\s*([A-Za-z]{2})\s*-\s*([^-]+)\s*-\s*([^,$]+),\s*\.?\s*([A-Za-z]{2})\s*\$?([\d,]+)/i);
    
    if (!match) {
      console.log("VMS line did not match pattern:", line);
      continue;
    }
    
    console.log("VMS matched line:", line);
    
    const count = parseInt(match[1], 10);
    const pickupCity = match[2].trim();
    const pickupState = match[3].toUpperCase();
    const commodityRaw = match[4].trim().toLowerCase();
    const destCity = match[5].trim();
    const destState = match[6].toUpperCase();
    const rateRaw = parseFloat(match[7].replace(/,/g, ''));
    
    // Normalize commodity - "cars" or "bales" = "Crushed Cars"
    const commodity = (commodityRaw === 'cars' || commodityRaw === 'bales') ? 'Crushed Cars' : commodityRaw;
    
    // Fixed weight of 47,000 lbs per user specification
    const weightLbs = 47000;
    
    // Calculate financial fields (flat rate, not per ton)
    const rateFields = calculateRateFields(rateRaw, weightLbs, false);
    
    // Extract notes from remainder of line
    const noteMatch = line.match(/\$[\d,]+\s*-?\s*(.+)$/i);
    const notes = noteMatch ? noteMatch[1].replace(/^-\s*/, '').trim() : null;
    
    // Create 'count' number of individual load records with FIXED instance numbers
    // The instance number is simply 1 to count, making load numbers deterministic per route
    // When the same route appears with count=2, it will always create instances 01 and 02
    // Format: VMS-{pickup_state}{dest_state}-{hash_of_route}-{instance}
    // IMPORTANT: Normalize case to ensure "Tn" and "TN" hash the same
    const normalizedPickupState = pickupState.toUpperCase();
    const normalizedDestState = destState.toUpperCase();
    const routeKey = `${pickupCity.toLowerCase()}|${normalizedPickupState}|${destCity.toLowerCase()}|${normalizedDestState}|${rateRaw}`;
    const routeHash = simpleHash(routeKey);
    
    for (let i = 0; i < count; i++) {
      const instanceNum = i + 1; // Always 1, 2, 3... based on count in THIS line
      const loadNumber = `VMS-${normalizedPickupState}${normalizedDestState}-${routeHash}-${String(instanceNum).padStart(2, '0')}`;
      
      const baseLoad: Record<string, unknown> = {
        agency_id: agencyId,
        template_type: "vms_email",
        load_number: loadNumber,
        customer_name: "VMS",
        pickup_city: pickupCity,
        pickup_state: pickupState,
        pickup_location_raw: `${pickupCity}, ${pickupState}`,
        dest_city: destCity,
        dest_state: destState,
        dest_location_raw: `${destCity}, ${destState}`,
        ship_date: new Date().toISOString().split('T')[0],
        delivery_date: null,
        trailer_type: "Flatbed", // VMS defaults to flatbed
        trailer_footage: null,
        weight_lbs: weightLbs,
        tarp_required: false,
        ...rateFields,
        commodity: commodity,
        miles: null,
        status: "open",
        dispatch_status: "open",
        source_row: { original_line: line, load_instance: i + 1, total_instances: count },
      };
      
      if (notes) {
        baseLoad.commodity = `${commodity} - ${notes}`;
      }
      
      baseLoad.load_call_script = generateLoadCallScript(baseLoad);
      
      loads.push(baseLoad);
    }
  }
  
  return loads;
}

// ============= ADELPHIA MAPPER =============
function mapAdelphiaRow(row: Record<string, string>, agencyId: string, rowIndex: number): Record<string, unknown> {
  const pickupLocationRaw = row["_col_A"] || row["PICK UP AT"] || "";
  const rateRawStr = row["_col_C"] || row["RATE"] || "";
  const destLocationRaw = row["_col_D"] || row["DESTINATION"] || "";
  const notes = row["_col_F"] || "";
  const deliveryDateStr = row["_col_H"] || row["READY"] || "";
  const weightStr = row["_col_I"] || row["WEIGHT"] || "";
  const lengthStr = row["_col_J"] || row["LENGTH"] || "";
  const tarpStr = row["_col_K"] || row["TARP"] || "";
  
  let destCity = "";
  let destState = "";
  if (destLocationRaw) {
    const parts = destLocationRaw.split(",").map(s => s.trim());
    if (parts.length >= 2) {
      destCity = parts[0];
      destState = parts[1];
    } else {
      destCity = destLocationRaw;
    }
  }
  
  let pickupCity = "";
  let pickupState = "";
  if (pickupLocationRaw) {
    const parts = pickupLocationRaw.split(",").map(s => s.trim());
    if (parts.length >= 2) {
      pickupCity = parts[0];
      pickupState = parts[1];
    } else {
      pickupCity = pickupLocationRaw;
    }
  }
  
  const rateNumeric = parseNumber(rateRawStr);
  const weightLbs = parseNumber(weightStr);
  const isPerTon = false;
  const rateFields = calculateRateFields(rateNumeric, weightLbs, isPerTon);
  
  // Generate deterministic load number based on content hash
  const pickupAbbrev = pickupState || pickupCity.substring(0, 3).toUpperCase();
  const destAbbrev = destState || destCity.substring(0, 3).toUpperCase();
  const contentKey = `${pickupLocationRaw}|${destLocationRaw}|${rateRawStr}|${weightStr}`;
  const contentHash = simpleHash(contentKey);
  const loadNumber = `ADE-${pickupAbbrev}${destAbbrev}-${contentHash}`;
  
  const baseLoad: Record<string, unknown> = {
    agency_id: agencyId,
    template_type: "adelphia_xlsx",
    load_number: loadNumber,
    customer_name: "ADELPHIA METALS",
    pickup_city: pickupCity || null,
    pickup_state: pickupState || null,
    pickup_location_raw: pickupLocationRaw || null,
    dest_city: destCity || null,
    dest_state: destState || null,
    dest_location_raw: destLocationRaw || null,
    ship_date: parseDate(deliveryDateStr),
    delivery_date: parseDate(deliveryDateStr),
    trailer_type: "Flatbed", // Adelphia defaults to flatbed
    trailer_footage: parseNumber(lengthStr),
    weight_lbs: weightLbs,
    tarp_required: parseTarpRequired(tarpStr),
    ...rateFields,
    commodity: notes || null,
    miles: null,
    status: "open",
    dispatch_status: "open",
    source_row: row,
  };
  
  baseLoad.load_call_script = generateLoadCallScript(baseLoad);
  
  return baseLoad;
}

// ============= OLDCASTLE GSHEET XLSX MAPPING =============
function parseOldcastleAllSheets(buffer: ArrayBuffer, agencyId: string): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const allLoads: Record<string, unknown>[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"]);

    // Find header row by looking for "equipment" in column A (rows 0-5)
    let headerRow = -1;
    for (let r = 0; r <= Math.min(5, range.e.r); r++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
      if (cell && String(cell.v).toLowerCase().trim() === "equipment") {
        headerRow = r;
        break;
      }
    }
    if (headerRow === -1) {
      console.log(`Skipping sheet "${sheetName}" - no equipment header found`);
      continue;
    }

    // Read headers
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
      headers.push(cell ? String(cell.v).toLowerCase().trim() : "");
    }

    // Map header names to column indices
    const colMap: Record<string, number> = {};
    const targets = ["equipment", "shipper city", "shipper state", "delivery city", "delivery state", "ready date", "rate", "weight"];
    for (const target of targets) {
      const idx = headers.findIndex(h => h.includes(target) || h === target);
      if (idx >= 0) colMap[target] = idx;
    }

    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const getVal = (col: string): string => {
        const idx = colMap[col];
        if (idx === undefined) return "";
        const cell = sheet[XLSX.utils.encode_cell({ r, c: idx })];
        return cell ? String(cell.v).trim() : "";
      };

      const equipment = getVal("equipment");
      const deliveryCity = getVal("delivery city");
      if (!equipment || !deliveryCity) continue;

      const shipperCity = getVal("shipper city");
      const shipperState = getVal("shipper state");
      const deliveryState = getVal("delivery state") || shipperState;
      const pickupRaw = [shipperCity, shipperState].filter(Boolean).join(", ");
      const destRaw = [deliveryCity, deliveryState].filter(Boolean).join(", ");
      const rateNumeric = parseNumber(getVal("rate"));
      const weightLbs = parseNumber(getVal("weight"));

      const contentKey = `${pickupRaw}|${destRaw}|${rateNumeric}|${equipment}|${sheetName}`;
      const loadNumber = `OC-${simpleHash(contentKey)}`;
      const rateFields = calculateRateFields(rateNumeric, weightLbs, false);

      const trailerType = equipment.toUpperCase().includes("VAN") ? "Van"
        : equipment.toUpperCase().includes("FLAT") ? "Flatbed"
        : equipment || null;

      const load: Record<string, unknown> = {
        agency_id: agencyId,
        template_type: "oldcastle_gsheet",
        load_number: loadNumber,
        customer_name: "OLDCASTLE",
        pickup_city: shipperCity || null,
        pickup_state: shipperState || null,
        pickup_location_raw: pickupRaw || null,
        dest_city: deliveryCity || null,
        dest_state: deliveryState || null,
        dest_location_raw: destRaw || null,
        ship_date: parseDate(getVal("ready date")) || new Date().toISOString().split("T")[0],
        delivery_date: parseDate(getVal("ready date")) || new Date().toISOString().split("T")[0],
        trailer_type: trailerType,
        weight_lbs: weightLbs,
        ...rateFields,
        commodity: null,
        miles: null,
        tarp_required: false,
        status: "open",
        dispatch_status: "open",
        source_row: { sheet: sheetName, equipment },
      };

      load.load_call_script = `Load ${loadNumber}: ${equipment} from ${pickupRaw} to ${destRaw}. Rate $${rateNumeric || 'TBD'}.`;
      allLoads.push(load);
    }

    console.log(`Sheet "${sheetName}": ${allLoads.length} loads so far`);
  }

  return allLoads;
}

// ============= CUSTOMER DETECTION (subject + body) =============
type EmailImportKind = "vms" | "oldcastle" | "adelphia" | "century" | "allied" | "semco";

function stripHtmlToText(s: string): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Subject line only — order: VMS, Oldcastle, Adelphia, Allied, Semco, then Century ("century"). Sender ardell@centuryent.com forces Century before this runs. */
function detectFromSubject(subjectLower: string): EmailImportKind | null {
  const s = subjectLower || "";
  const containsVMS = s.includes("vms") || s.includes("mvs") || s.includes("vsm");
  const containsOldcastle = s.includes("oldcastle") || s.includes("old castle");
  const containsAdelphia =
    s.includes("adelphia") ||
    s.includes("aldelphia") ||
    s.includes("adlephia") ||
    s.includes("adelphoa") ||
    s.includes("adelpha");
  const containsCentury = subjectMatchesCenturyKeyword(s);
  const containsAllied = s.includes("allied building stores") || /\babs\b/i.test(s);
  const containsSemco = s.includes("semco distributing") || s.includes("semco");

  if (containsVMS) return "vms";
  if (containsOldcastle) return "oldcastle";
  if (containsAdelphia) return "adelphia";
  if (containsAllied) return "allied";
  if (containsSemco) return "semco";
  if (containsCentury) return "century";
  return null;
}

/** Body text (lowercased) — same priority; includes explicit phrases from product spec */
function detectFromBody(bodyLower: string): EmailImportKind | null {
  const b = bodyLower || "";
  if (b.length < 3) return null;

  if (b.includes("valley metal services") || b.includes("vms") || b.includes("mvs") || b.includes("vsm")) {
    return "vms";
  }
  if (b.includes("oldcastle") || b.includes("old castle")) return "oldcastle";
  if (
    b.includes("adelphia metals") ||
    b.includes("adelphia") ||
    b.includes("aldelphia") ||
    b.includes("adlephia") ||
    b.includes("adelphoa") ||
    b.includes("adelpha")
  ) {
    return "adelphia";
  }
  if (b.includes("allied building stores") || /\babs\b/.test(b)) return "allied";
  if (b.includes("semco distributing") || b.includes("semco")) return "semco";
  if (subjectMatchesCenturyKeyword(b)) return "century";
  return null;
}

async function fetchInboundEmailBody(
  emailId: string | undefined,
  resendApiKey: string | undefined,
  payload: Record<string, unknown>,
): Promise<string> {
  const data = payload.data as Record<string, unknown> | undefined;
  const email = payload.email as Record<string, unknown> | undefined;

  const direct =
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.html === "string" && payload.html) ||
    (data && typeof data.text === "string" && data.text) ||
    (data && typeof data.html === "string" && data.html) ||
    (email && typeof email.text === "string" && email.text) ||
    (email && typeof email.html === "string" && email.html) ||
    "";

  if (direct && String(direct).trim().length > 0) {
    return stripHtmlToText(String(direct));
  }

  if (!emailId || !resendApiKey) return "";

  try {
    const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${resendApiKey}` },
    });
    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error("fetchInboundEmailBody: Resend receiving API error:", emailResponse.status, errText);
      return "";
    }
    const emailData = (await emailResponse.json()) as { text?: string; html?: string };
    const raw = emailData.text || emailData.html || "";
    return stripHtmlToText(String(raw));
  } catch (e) {
    console.error("fetchInboundEmailBody error:", e);
    return "";
  }
}

// ============= MAIN HANDLER =============
Deno.serve(async (req) => {
  console.log("=== EMAIL-IMPORT-LOADS FUNCTION CALLED ===");
  console.log("Method:", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  console.log('Anthropic key prefix:', anthropicKey?.slice(0, 10));

  const supabase = createClient(supabaseUrl, supabaseKey);
  const resend = resendApiKey ? new Resend(resendApiKey) : null;
  
  try {
    // Resend inbound email webhook payload
    const payload = await req.json();
    
    // Only process email.received events - ignore domain.updated, email.bounced, etc.
    const eventType = payload.type;
    if (eventType && eventType !== "email.received") {
      console.log("Ignoring non-email event:", eventType);
      return new Response(JSON.stringify({ ignored: true, event_type: eventType }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("Payload keys:", Object.keys(payload));
    console.log("Payload.data keys:", payload.data ? Object.keys(payload.data) : "no data");
    
    // Resend inbound webhooks use different field names
    // See: https://resend.com/docs/dashboard/webhooks/event-types#email-received
    const senderEmail = payload.from || payload.sender || payload.email?.from || 
      (typeof payload.data?.from === 'string' ? payload.data.from : payload.data?.from?.email);
    const emailHeaders = (payload.headers || payload.data?.headers || {}) as Record<string, unknown>;
    const subject = resolveInboundEmailSubject(payload as Record<string, unknown>, emailHeaders);
    const attachments = payload.attachments || payload.data?.attachments || payload.email?.attachments || [];
    
    console.log("From:", senderEmail);
    console.log("Subject:", subject);
    console.log("Attachments count:", attachments.length);
    
    // Extract sender domain - handle both "email@domain.com" and "Name <email@domain.com>" formats
    let cleanEmail = senderEmail || "";
    // Extract email from "Name <email@domain.com>" format
    const emailMatch = cleanEmail.match(/<([^>]+)>/);
    if (emailMatch) {
      cleanEmail = emailMatch[1];
    }
    const senderDomain = cleanEmail.split("@")[1]?.toLowerCase()?.replace(/[^a-z0-9.-]/g, '');
    
    console.log("Cleaned email:", cleanEmail, "Domain:", senderDomain);
    
    if (!senderDomain) {
      console.error("Invalid sender email:", senderEmail);
      return new Response(JSON.stringify({ error: "Invalid sender email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const subjectLower = String(subject || "").toLowerCase();
    const emailId = payload.data?.email_id || payload.email_id;

    const senderLower = cleanEmail.toLowerCase().trim();
    let importKind: EmailImportKind | null = senderLower === "ardell@centuryent.com"
      ? "century"
      : detectFromSubject(subjectLower);
    let emailBody = "";

    if (!importKind) {
      console.log("Subject did not match customer keywords; fetching body and checking…");
      emailBody = await fetchInboundEmailBody(emailId, resendApiKey, payload as Record<string, unknown>);
      importKind = detectFromBody(emailBody.toLowerCase());
      if (importKind) {
        console.log(`Body matched import kind: ${importKind} (body length=${emailBody.length})`);
      }
    }

    if (!importKind) {
      console.error("Neither subject nor body matched a known customer import:", subject);
      await supabase.from("email_import_logs").insert({
        sender_email: senderEmail,
        subject: subject,
        status: "rejected",
        error_message:
          "No customer keywords in subject or body (Adelphia, VMS, Oldcastle, Century, ardell@centuryent.com, Allied, Semco)",
        raw_headers: emailHeaders,
      });
      return new Response(
        JSON.stringify({
          error:
            "Email must mention a supported customer in the subject or body (e.g. Adelphia, VMS, Oldcastle, Century, ardell@centuryent.com, Allied Building Stores, Semco)",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const importType: EmailImportKind = importKind;
    console.log(`Processing ${importType.toUpperCase()} import (subject and/or body match)`);

    if (importType === "vms" && (!emailBody || emailBody.trim().length === 0)) {
      emailBody = await fetchInboundEmailBody(emailId, resendApiKey, payload as Record<string, unknown>);
      console.log("VMS: ensured email body; length:", emailBody.length);
    }

    // Look up agency by sender domain in allowed_sender_domains
    // This is the most reliable approach since domains are explicitly configured per agency
    const { data: agencyByDomain } = await supabase
      .from("agencies")
      .select("id, name, allowed_sender_domains")
      .contains("allowed_sender_domains", [senderDomain])
      .limit(1)
      .single();
    
    // Fallback: look up by import type name/code for backward compatibility
    let agency = agencyByDomain;
    if (!agency) {
      console.log("No agency found by domain, falling back to name/code lookup");
      const fallbackFilter =
        importType === "vms"
          ? "name.ilike.%dl transport%,import_email_code.eq.VMS"
          : importType === "oldcastle"
          ? "name.ilike.%oldcastle%,import_email_code.eq.OLDCASTLE"
          : importType === "century"
          ? "name.ilike.%century%,import_email_code.eq.CENTURY"
          : importType === "allied"
          ? "name.ilike.%allied%,import_email_code.eq.ALLIED"
          : importType === "semco"
          ? "name.ilike.%semco%,import_email_code.eq.SEMCO"
          : "name.ilike.%adelphia%,import_email_code.eq.ADELPHIA";
      const { data: agencyByCode } = await supabase
        .from("agencies")
        .select("id, name, allowed_sender_domains")
        .or(fallbackFilter)
        .limit(1)
        .single();
      agency = agencyByCode;
    }
    
    const agencyError = !agency;
    
    if (agencyError || !agency) {
      if (importType === "century" || importType === "allied" || importType === "semco") {
        const templateType =
          importType === "century"
            ? "century_pdf"
            : importType === "allied"
            ? "allied_xlsx"
            : "semco_xlsx";
        console.warn(`${templateType}: agency not found — logging email as received anyway`);
        await supabase.from("email_import_logs").insert({
          agency_id: null,
          sender_email: senderEmail,
          subject: subject,
          status: "received",
          imported_count: 0,
          error_message: `${templateType}: agency not configured; email recorded (parser pending)`,
          raw_headers: emailHeaders,
        });
        return new Response(
          JSON.stringify({
            success: true,
            received: true,
            template_type: templateType,
            message: "Email logged; configure agency import mapping to enable full processing",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.error(`${importType.toUpperCase()} agency not found`);

      await supabase.from("email_import_logs").insert({
        sender_email: senderEmail,
        subject: subject,
        status: "rejected",
        error_message: `${importType.toUpperCase()} agency not configured in the system`,
        raw_headers: emailHeaders,
      });

      return new Response(JSON.stringify({ error: `${importType.toUpperCase()} agency not configured` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("Found agency:", agency.name, agency.id);
    
    // Validate sender domain against whitelist (full-address exceptions in EDGE_EXTRA_ALLOWED_SENDER_EMAILS)
    const allowedDomains = (agency.allowed_sender_domains || []).map((d: string) => d.toLowerCase());
    const senderAllowedByAddress = EDGE_EXTRA_ALLOWED_SENDER_EMAILS.has(senderLower);
    if (allowedDomains.length > 0 && !allowedDomains.includes(senderDomain) && !senderAllowedByAddress) {
      console.error("Sender domain not whitelisted:", senderDomain);
      
      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "rejected",
        error_message: `Sender domain '${senderDomain}' not in whitelist`,
        raw_headers: emailHeaders,
      });
      
      // Send rejection email if Resend is configured
      if (resend) {
        await resend.emails.send({
          from: "Trucking Lane <noreply@truckinglane.com>",
          to: [senderEmail],
          subject: "Import Rejected - Unauthorized Sender",
          html: `
            <p>Your email import was rejected because your email domain (${senderDomain}) is not authorized to send imports for ${agency.name}.</p>
            <p>Please contact your administrator to add your domain to the whitelist.</p>
          `,
        }).catch(e => console.error("Failed to send rejection email:", e));
      }
      
      return new Response(JSON.stringify({ error: "Sender domain not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============= ALLIED / SEMCO (parser pending — log only) =============
    if (importType === "allied" || importType === "semco") {
      const templateType = importType === "allied" ? "allied_xlsx" : "semco_xlsx";
      console.log(`[${templateType}] Email accepted — full XLSX parser not implemented yet; logging as received`);
      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "received",
        imported_count: 0,
        error_message: `Accepted for ${templateType}; parser implementation pending`,
        raw_headers: emailHeaders,
      });
      return new Response(
        JSON.stringify({
          success: true,
          received: true,
          template_type: templateType,
          agency: agency.name,
          message: "Email logged; import parser not yet implemented for this customer",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ============= CENTURY: PDF auto-import (subject contains "century", or ardell@centuryent.com) =============
    const centuryPdfSubjectOk =
      subjectLower.includes("century") || senderLower === "ardell@centuryent.com";
    if (importType === "century" && !centuryPdfSubjectOk) {
      console.log("[century] Subject has no 'century' keyword — logging; PDF auto-import not triggered");
      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "received",
        imported_count: 0,
        error_message:
          'Century PDF auto-import requires "century" in the subject (or send from ardell@centuryent.com)',
        raw_headers: emailHeaders,
      });
      return new Response(
        JSON.stringify({
          success: true,
          received: true,
          template_type: "century_pdf",
          agency: agency.name,
          message: "Email logged; add \"century\" to the subject to run PDF import",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (importType === "century" && centuryPdfSubjectOk) {
      const CENTURY_TEMPLATE = "century_pdf";
      const pdfs = (attachments as { filename?: string; content?: string; id?: string }[]).filter((a) =>
        a.filename?.toLowerCase().endsWith(".pdf")
      );

      if (pdfs.length === 0) {
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: "Century PDF import: no PDF attachments found",
          raw_headers: emailHeaders,
        });
        return new Response(JSON.stringify({ error: "No PDF attachments found for Century import" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!anthropicKey) {
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: "ANTHROPIC_API_KEY not configured",
          raw_headers: emailHeaders,
        });
        return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const centuryDedupeKey = inboundDedupeSenderFilenameKey(
        senderLower,
        centuryPdfDedupeFilenamePart(pdfs),
      );
      const centuryDupResp = await responseIfDuplicateSenderFilenameWithinHour(
        supabase,
        centuryDedupeKey,
        {
          agency_id: agency.id,
          sender_email: senderEmail,
          subject,
          raw_headers: emailHeaders,
        },
      );
      if (centuryDupResp) return centuryDupResp;

      const pCentury = payload as Record<string, unknown>;
      const dataCentury = pCentury.data as Record<string, unknown> | undefined;
      const c1 = dataCentury?.created_at;
      const c2 = pCentury.created_at;
      const receivedRaw =
        (typeof c1 === "string" && c1) ||
        (typeof c2 === "string" && c2) ||
        new Date().toISOString();
      const receivedIso = new Date(receivedRaw).toISOString();

      const parseErrors: string[] = [];
      const finalRows: Record<string, unknown>[] = [];
      let idx = 0;
      for (const att of pdfs) {
        idx += 1;
        try {
          const buf = await fetchInboundPdfAttachmentBuffer(emailId, att, resendApiKey);
          const pdfBase64 = uint8ToBase64(new Uint8Array(buf));
          const ext = await extractCenturyPdfWithClaude(pdfBase64, anthropicKey);

          const tons = ext.weight_tons;
          const ratePerTon = ext.rate_per_ton;
          if (!(tons > 0) || !(ratePerTon > 0)) {
            parseErrors.push(`${att.filename ?? `pdf_${idx}`}: missing weight_tons or rate_per_ton`);
            continue;
          }

          let loadNum = sanitizeCenturyLoadNumberFromPdf(ext.load_number, ext.reference_number);
          if (!loadNum) {
            const h = await centuryHash3(
              ext.pickup_state,
              ext.dest_state,
              `${idx}-${ext.pickup_city}-${ext.dest_city}-${tons}-${ratePerTon}`,
            );
            loadNum = `CENT-${ext.pickup_state}-${ext.dest_state}-${h}`;
          }

          // ship_date: next calendar day from email receipt (never PDF date) — product spec
          const shipDateYmd = centuryPickupDateFromEmailReceived(receivedIso);
          const weightLbs = Math.round(tons * 2000);
          const customerInvoiceTotal = Math.round(ratePerTon * tons);
          const targetPay = Math.round(customerInvoiceTotal * 0.8);
          const maxPay = Math.round(customerInvoiceTotal * 0.85);
          const targetCommission = Math.round(customerInvoiceTotal * 0.2);
          const maxCommission = Math.round(customerInvoiceTotal * 0.15);

          const commodity = ext.contains_bales ? "baled aluminum" : "crushed cars";
          const pickupRaw = ext.pickup_city && ext.pickup_state
            ? `${ext.pickup_city}, ${ext.pickup_state}`
            : null;
          const destRaw = ext.dest_city && ext.dest_state ? `${ext.dest_city}, ${ext.dest_state}` : null;
          const today = new Date().toISOString().split("T")[0];

          finalRows.push({
            agency_id: agency.id,
            template_type: CENTURY_TEMPLATE,
            load_number: loadNum,
            customer_name: ext.destination_company || null,
            pickup_city: ext.pickup_city || null,
            pickup_state: ext.pickup_state || null,
            pickup_location_raw: pickupRaw,
            dest_city: ext.dest_city || null,
            dest_state: ext.dest_state || null,
            dest_location_raw: destRaw,
            ship_date: shipDateYmd,
            board_date: today,
            delivery_date: null,
            trailer_type: "Flatbed",
            weight_lbs: weightLbs,
            is_per_ton: true,
            rate_raw: ratePerTon,
            customer_invoice_total: customerInvoiceTotal,
            target_pay: targetPay,
            max_pay: maxPay,
            target_commission: targetCommission,
            max_commission: maxCommission,
            commission_target_pct: 0.2,
            commission_max_pct: 0.15,
            commodity,
            dispatch_status: "open",
            status: "open",
            is_active: true,
            dat_posted_at: null,
            archived_at: null,
            tarp_required: false,
            source_row: {
              century_pdf: att.filename ?? "load.pdf",
              index: idx,
              document_pickup_date: ext.pickup_date,
            },
            load_call_script:
              `Load ${loadNum}: ${commodity} from ${pickupRaw ?? "TBD"} to ${destRaw ?? "TBD"}. ` +
              `${tons} tons @ $${ratePerTon}/ton (invoice ~$${customerInvoiceTotal}).`,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          parseErrors.push(`${att.filename ?? `pdf_${idx}`}: ${msg}`);
        }
      }

      if (finalRows.length === 0) {
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: `Century PDF: no loads parsed. ${parseErrors.join(" | ")}`,
          raw_headers: emailHeaders,
        });
        return new Response(
          JSON.stringify({ error: "Could not parse any Century PDFs", details: parseErrors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const byNum = new Map<string, Record<string, unknown>>();
      for (const row of finalRows) {
        byNum.set(String(row.load_number), row);
      }
      const safeLoads = Array.from(byNum.values());
      const dupesDroppedCentury = finalRows.length - safeLoads.length;

      const currentLoadNumbers = safeLoads.map((l) => String(l.load_number));
      const nu = await countNewUpdatedForImport(supabase, agency.id, CENTURY_TEMPLATE, currentLoadNumbers);
      const newCountCentury = nu.new;
      const updatedCountCentury = nu.updated;

      await supabase.from("load_import_runs").insert({
        agency_id: agency.id,
        template_type: CENTURY_TEMPLATE,
        file_name: `email-${pdfs.length}-pdf`,
        row_count: safeLoads.length,
        replaced_count: 0,
      });

      const loadsForUpsert = safeLoads.map((load) => ({
        ...load,
        archived_at: null,
      }));

      const { error: insertError } = await supabase.from("loads").upsert(loadsForUpsert, {
        onConflict: "agency_id,template_type,load_number",
        ignoreDuplicates: false,
      });

      if (insertError) {
        console.error("Century PDF upsert error:", insertError);
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: insertError.message,
          raw_headers: emailHeaders,
        });
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const notInList = `(${currentLoadNumbers.map((n) => `"${String(n).replace(/"/g, "")}"`).join(",")})`;
      const { data: archivedData } = await supabase
        .from("loads")
        .update({
          dispatch_status: "archived",
          is_active: false,
          archived_at: new Date().toISOString(),
        })
        .eq("agency_id", agency.id)
        .eq("template_type", CENTURY_TEMPLATE)
        .neq("dispatch_status", "archived")
        .is("booked_at", null)
        .not("load_number", "in", notInList)
        .select("id");

      const archivedCountCentury = archivedData?.length ?? 0;
      if (archivedCountCentury) {
        console.log(`Archived ${archivedCountCentury} Century PDF loads not in current batch`);
      }

      await postLoadsToX(safeLoads);

      const totalActiveCentury = await countActiveLoadsForTemplate(supabase, agency.id, CENTURY_TEMPLATE);

      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "success",
        imported_count: safeLoads.length,
        raw_headers: mergeImportActivityHeaders(emailHeaders, {
          template_type: CENTURY_TEMPLATE,
          source: "Century PDF",
          new: newCountCentury,
          updated: updatedCountCentury,
          dupes_dropped: dupesDroppedCentury,
          removed: archivedCountCentury,
          supports_removal: true,
          new_count: newCountCentury,
          updated_count: updatedCountCentury,
          removed_count: archivedCountCentury,
          total_count: totalActiveCentury,
        }),
      });

      await recordSuccessfulInboundDedupe(supabase, centuryDedupeKey);

      return new Response(
        JSON.stringify({
          success: true,
          imported: safeLoads.length,
          new: newCountCentury,
          updated: updatedCountCentury,
          removed: archivedCountCentury,
          dupes_dropped: dupesDroppedCentury,
          parse_warnings: parseErrors.length ? parseErrors : undefined,
          agency: agency.name,
          import_type: CENTURY_TEMPLATE,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ============= VMS EMAIL BODY IMPORT =============
    if (importType === "vms") {
      console.log("Processing VMS email body import");
      console.log("Email body length:", emailBody.length);
      
      if (!emailBody || emailBody.trim().length === 0) {
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: "No email body found for VMS import",
          raw_headers: emailHeaders,
        });
        
        return new Response(JSON.stringify({ error: "No email body found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Parse VMS email body
      const mappedLoads = parseVMSEmailBody(emailBody, agency.id);
      
      console.log(`Parsed ${mappedLoads.length} VMS loads from email body`);
      
      if (mappedLoads.length === 0) {
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: "No valid loads found in email body",
          raw_headers: emailHeaders,
        });
        
        return new Response(JSON.stringify({ error: "No valid loads found in email body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Create import batch record
      await supabase.from("load_import_runs").insert({
        agency_id: agency.id,
        template_type: "vms_email",
        file_name: `email-${new Date().toISOString().split('T')[0]}`,
        row_count: mappedLoads.length,
        replaced_count: 0,
      });
      
      // Deduplicate by load_number to prevent "ON CONFLICT DO UPDATE cannot affect row a second time" error
      // Keep the last occurrence of each load_number (in case of duplicates)
      const loadsByNumber = new Map<string, Record<string, unknown>>();
      for (const load of mappedLoads) {
        const loadNumber = load.load_number as string;
        loadsByNumber.set(loadNumber, load);
      }
      const safeLoads = Array.from(loadsByNumber.values());
      console.log(`Deduplicated ${mappedLoads.length} loads to ${safeLoads.length} unique loads`);
      const dupesDroppedVms = mappedLoads.length - safeLoads.length;

      let importedCount = 0;
      let archivedNotInBatch = 0;
      let newCountVms = 0;
      let updatedCountVms = 0;
      const loadNumberNotInList = (nums: string[]) =>
        `(${nums.map((n) => `"${String(n).replace(/"/g, "")}"`).join(",")})`;

      if (safeLoads.length > 0) {
        const currentLoadNumbers = safeLoads.map((l) => String(l.load_number));
        const nu = await countNewUpdatedForImport(supabase, agency.id, "vms_email", currentLoadNumbers);
        newCountVms = nu.new;
        updatedCountVms = nu.updated;

        const today = new Date().toISOString().split("T")[0];
        const loadsWithBoardDate = safeLoads.map(load => ({
          ...load,
          is_active: true,
          board_date: today,
          archived_at: null,
          dispatch_status: "open",
        }));
        
        const { error: insertError } = await supabase
          .from("loads")
          .upsert(loadsWithBoardDate, {
            onConflict: "agency_id,template_type,load_number",
            ignoreDuplicates: false,
          });
        
        if (insertError) {
          console.error("Upsert error:", insertError);
          
          await supabase.from("email_import_logs").insert({
            agency_id: agency.id,
            sender_email: senderEmail,
            subject: subject,
            status: "failed",
            error_message: insertError.message,
            raw_headers: emailHeaders,
          });
          
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        importedCount = safeLoads.length;
        
        // Archive loads not in this email's load numbers (never delete)
        const { data: archivedRows } = await supabase
          .from("loads")
          .update({
            dispatch_status: "archived",
            is_active: false,
            archived_at: new Date().toISOString(),
          })
          .eq("agency_id", agency.id)
          .eq("template_type", "vms_email")
          .neq("dispatch_status", "archived")
          .is("booked_at", null)
          .not("load_number", "in", loadNumberNotInList(currentLoadNumbers))
          .select("id");
        archivedNotInBatch = archivedRows?.length ?? 0;
        if (archivedNotInBatch) {
          console.log(`Archived ${archivedNotInBatch} VMS loads not in current batch`);
        }
        
        // Post new loads to X
        await postLoadsToX(safeLoads);
      }
      
      console.log(`Imported ${importedCount} VMS loads`);
      
      
      // Log successful import
      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "success",
        imported_count: importedCount,
        raw_headers: mergeImportActivityHeaders(emailHeaders, {
          template_type: "vms_email",
          new: newCountVms,
          updated: updatedCountVms,
          dupes_dropped: dupesDroppedVms,
          removed: archivedNotInBatch,
          supports_removal: true,
        }),
      });
      
      // Note: No confirmation emails to external senders - import logs are visible in admin dashboard
      
      return new Response(JSON.stringify({
        success: true,
        imported: importedCount,
        archived: archivedNotInBatch,
        agency: agency.name,
        import_type: "vms_email",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // ============= OLDCASTLE XLSX IMPORT =============
    if (importType === "oldcastle") {
      console.log("Processing Oldcastle XLSX email import");
      
      // Find XLSX attachment
      const ocAttachment = attachments.find((att: { filename?: string; content?: string; id?: string }) => 
        att.filename?.toLowerCase().endsWith(".xlsx") || att.filename?.toLowerCase().endsWith(".xls")
      );
      
      if (!ocAttachment) {
        console.error("No XLSX attachment found for Oldcastle import");
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: "No XLSX attachment found in Oldcastle email",
          raw_headers: emailHeaders,
        });
        return new Response(JSON.stringify({ error: "No XLSX attachment found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log("Processing Oldcastle attachment:", ocAttachment.filename);

      const ocDedupePart =
        String(ocAttachment.filename ?? "").trim().toLowerCase() ||
        `id:${String(ocAttachment.id ?? "unknown")}`;
      const oldcastleDedupeKey = inboundDedupeSenderFilenameKey(senderLower, ocDedupePart);
      const oldcastleDupResp = await responseIfDuplicateSenderFilenameWithinHour(
        supabase,
        oldcastleDedupeKey,
        {
          agency_id: agency.id,
          sender_email: senderEmail,
          subject,
          raw_headers: emailHeaders,
        },
      );
      if (oldcastleDupResp) return oldcastleDupResp;
      
      // Fetch attachment content
      let ocBuffer: ArrayBuffer;
      if (ocAttachment.content) {
        const fileContent = decodeBase64(ocAttachment.content);
        ocBuffer = new Uint8Array(fileContent).buffer as ArrayBuffer;
      } else if (ocAttachment.id && resendApiKey) {
        const emailId = payload.data?.email_id || payload.email_id;
        if (!emailId) throw new Error("No email_id found in payload to fetch attachment");
        
        const listResponse = await fetch(
          `https://api.resend.com/emails/receiving/${emailId}/attachments`,
          { headers: { "Authorization": `Bearer ${resendApiKey}` } }
        );
        if (!listResponse.ok) throw new Error(`Failed to list attachments: ${listResponse.status}`);
        
        const attachmentsList = await listResponse.json();
        const attachmentData = attachmentsList.data?.find((a: { id: string }) => a.id === ocAttachment.id);
        if (!attachmentData?.download_url) throw new Error("Attachment download_url not found");
        
        const fileResponse = await fetch(attachmentData.download_url);
        if (!fileResponse.ok) throw new Error(`Failed to download attachment: ${fileResponse.status}`);
        ocBuffer = await fileResponse.arrayBuffer();
      } else {
        throw new Error("No attachment content or ID available");
      }
      
      // Parse using Oldcastle multi-sheet parser
      const mappedLoads = parseOldcastleAllSheets(ocBuffer, agency.id);
      console.log(`Parsed ${mappedLoads.length} Oldcastle loads`);
      
      if (mappedLoads.length === 0) {
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: "No valid Oldcastle loads found after parsing",
          raw_headers: emailHeaders,
        });
        return new Response(JSON.stringify({ error: "No valid loads found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Create import batch record
      await supabase.from("load_import_runs").insert({
        agency_id: agency.id,
        template_type: "oldcastle_gsheet",
        file_name: ocAttachment.filename,
        row_count: mappedLoads.length,
        replaced_count: 0,
      });
      
      // Deduplicate
      const loadsByNumber = new Map<string, Record<string, unknown>>();
      for (const load of mappedLoads) {
        loadsByNumber.set(load.load_number as string, load);
      }
      const safeLoads = Array.from(loadsByNumber.values());
      const dupesDroppedOc = mappedLoads.length - safeLoads.length;

      let importedCount = 0;
      let newCountOc = 0;
      let updatedCountOc = 0;
      let archivedCountOc = 0;
      if (safeLoads.length > 0) {
        const currentLoadNumbers = safeLoads.map((l) => String(l.load_number));
        const nuOc = await countNewUpdatedForImport(
          supabase,
          agency.id,
          "oldcastle_gsheet",
          currentLoadNumbers,
        );
        newCountOc = nuOc.new;
        updatedCountOc = nuOc.updated;

        const today = new Date().toISOString().split("T")[0];
        const loadsWithBoardDate = safeLoads.map(load => ({
          ...load,
          is_active: true,
          board_date: today,
          archived_at: null,
          dispatch_status: "open",
        }));
        
        const { error: insertError } = await supabase
          .from("loads")
          .upsert(loadsWithBoardDate, {
            onConflict: "agency_id,template_type,load_number",
            ignoreDuplicates: false,
          });
        
        if (insertError) {
          console.error("Oldcastle upsert error:", insertError);
          await supabase.from("email_import_logs").insert({
            agency_id: agency.id,
            sender_email: senderEmail,
            subject: subject,
            status: "failed",
            error_message: insertError.message,
            raw_headers: emailHeaders,
          });
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        importedCount = safeLoads.length;
        
        // Archive loads NOT in the new batch
        const { data: archivedData } = await supabase
          .from("loads")
          .update({ is_active: false, archived_at: new Date().toISOString() })
          .eq("agency_id", agency.id)
          .eq("template_type", "oldcastle_gsheet")
          .eq("is_active", true)
          .is("booked_at", null)
          .not("load_number", "in", `(${currentLoadNumbers.join(",")})`)
          .select("id");
        
        archivedCountOc = archivedData?.length || 0;
        console.log(`Archived ${archivedCountOc} Oldcastle loads not in current batch`);
        
        await postLoadsToX(safeLoads);
      }
      
      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "success",
        imported_count: importedCount,
        raw_headers: mergeImportActivityHeaders(emailHeaders, {
          template_type: "oldcastle_gsheet",
          new: newCountOc,
          updated: updatedCountOc,
          dupes_dropped: dupesDroppedOc,
          removed: archivedCountOc,
          supports_removal: true,
        }),
      });

      await recordSuccessfulInboundDedupe(supabase, oldcastleDedupeKey);
      
      return new Response(JSON.stringify({
        success: true,
        imported: importedCount,
        agency: agency.name,
        import_type: "oldcastle_gsheet",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============= ADELPHIA XLSX IMPORT =============
    if (importType === "adelphia") {
    // Find XLSX attachment
    const xlsxAttachment = attachments.find((att: { filename?: string; content?: string; id?: string }) => 
      att.filename?.toLowerCase().endsWith(".xlsx") || att.filename?.toLowerCase().endsWith(".xls")
    );
    
    if (!xlsxAttachment) {
      console.error("No XLSX attachment found");
      
      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "failed",
        error_message: "No XLSX attachment found in email",
        raw_headers: emailHeaders,
      });
      
      // Note: No error emails to external senders - errors are logged in admin dashboard
      
      return new Response(JSON.stringify({ error: "No XLSX attachment found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adelDedupePart =
      String(xlsxAttachment.filename ?? "").trim().toLowerCase() ||
      `id:${String(xlsxAttachment.id ?? "unknown")}`;
    const adelphiaDedupeKey = inboundDedupeSenderFilenameKey(senderLower, adelDedupePart);
    const adelphiaDupResp = await responseIfDuplicateSenderFilenameWithinHour(
      supabase,
      adelphiaDedupeKey,
      {
        agency_id: agency.id,
        sender_email: senderEmail,
        subject,
        raw_headers: emailHeaders,
      },
    );
    if (adelphiaDupResp) return adelphiaDupResp;
    
    console.log("Processing attachment:", xlsxAttachment.filename);
    
    // Fetch attachment content - Resend inbound webhooks provide attachment ID, not content
    // We need to fetch the attachment content using the Resend API
    let buffer: ArrayBuffer;
    
    if (xlsxAttachment.content) {
      // Content is provided directly (base64 encoded)
      console.log("Attachment has direct content, decoding base64...");
      const fileContent = decodeBase64(xlsxAttachment.content);
      buffer = new Uint8Array(fileContent).buffer as ArrayBuffer;
    } else if (xlsxAttachment.id && resendApiKey) {
      // Content needs to be fetched via Resend API
      // Step 1: List attachments to get the download_url
      console.log("Fetching attachment list via Resend API...");
      const emailId = payload.data?.email_id || payload.email_id;
      
      if (!emailId) {
        throw new Error("No email_id found in payload to fetch attachment");
      }
      
      // Call Resend's inbound/receiving attachments list endpoint
      // Note: For inbound emails, the endpoint is /emails/receiving/{emailId}/attachments
      const listResponse = await fetch(
        `https://api.resend.com/emails/receiving/${emailId}/attachments`,
        {
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
          },
        }
      );
      
      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error("Failed to list attachments from Resend:", listResponse.status, errorText);
        throw new Error(`Failed to list attachments: ${listResponse.status}`);
      }
      
      const attachmentsList = await listResponse.json();
      console.log("Attachments list response:", JSON.stringify(attachmentsList));
      
      // Find our attachment by ID
      const attachmentData = attachmentsList.data?.find((a: { id: string }) => a.id === xlsxAttachment.id);
      
      if (!attachmentData || !attachmentData.download_url) {
        console.error("Attachment not found in list or no download_url:", xlsxAttachment.id);
        throw new Error("Attachment download_url not found");
      }
      
      console.log("Found download_url, fetching file content...");
      
      // Step 2: Download the actual file content from the download_url
      const fileResponse = await fetch(attachmentData.download_url);
      
      if (!fileResponse.ok) {
        const errorText = await fileResponse.text();
        console.error("Failed to download attachment:", fileResponse.status, errorText);
        throw new Error(`Failed to download attachment: ${fileResponse.status}`);
      }
      
      buffer = await fileResponse.arrayBuffer();
      console.log("Downloaded attachment, size:", buffer.byteLength, "bytes");
    } else {
      throw new Error("No attachment content or ID available, and no Resend API key configured");
    }
    
    // Parse XLSX (Adelphia format: header on row 4)
    const rows = parseXLSX(buffer, "PAGE 1", 4);
    
    if (rows.length === 0) {
      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "failed",
        error_message: "No data rows found in XLSX",
        raw_headers: emailHeaders,
      });
      
      // Note: No error emails to external senders - errors are logged in admin dashboard
      
      return new Response(JSON.stringify({ error: "No data rows found in XLSX" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log(`Parsed ${rows.length} rows from XLSX`);
    
    // Map rows to loads
    let mappedLoads = rows.map((row, index) => mapAdelphiaRow(row, agency.id, index + 1));
    
    // Filter out rows without valid city data
    mappedLoads = mappedLoads.filter(load => {
      const hasPickupCity = load.pickup_city && String(load.pickup_city).trim().length > 0;
      const hasDestCity = load.dest_city && String(load.dest_city).trim().length > 0;
      return hasPickupCity && hasDestCity;
    });
    
    console.log(`${mappedLoads.length} loads after filtering`);
    
    if (mappedLoads.length === 0) {
      await supabase.from("email_import_logs").insert({
        agency_id: agency.id,
        sender_email: senderEmail,
        subject: subject,
        status: "failed",
        error_message: "No valid loads found after parsing",
        raw_headers: emailHeaders,
      });
      
      return new Response(JSON.stringify({ error: "No valid loads found after parsing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Create import batch record
    await supabase.from("load_import_runs").insert({
      agency_id: agency.id,
      template_type: "adelphia_xlsx",
      file_name: xlsxAttachment.filename,
      row_count: mappedLoads.length,
      replaced_count: 0,
    });
    
    // Deduplicate by load_number to prevent "ON CONFLICT DO UPDATE cannot affect row a second time" error
    const loadsByNumber = new Map<string, Record<string, unknown>>();
    for (const load of mappedLoads) {
      const loadNumber = load.load_number as string;
      loadsByNumber.set(loadNumber, load);
    }
    const safeLoads = Array.from(loadsByNumber.values());
    console.log(`Deduplicated ${mappedLoads.length} loads to ${safeLoads.length} unique Adelphia loads`);
    const dupesDroppedAdel = mappedLoads.length - safeLoads.length;

    let importedCount = 0;
    let newCountAdel = 0;
    let updatedCountAdel = 0;
    let archivedCountAdel = 0;

    if (safeLoads.length > 0) {
      const currentLoadNumbers = safeLoads.map((l) => String(l.load_number));
      const nuAdel = await countNewUpdatedForImport(supabase, agency.id, "adelphia_xlsx", currentLoadNumbers);
      newCountAdel = nuAdel.new;
      updatedCountAdel = nuAdel.updated;

      const today = new Date().toISOString().split("T")[0];
      const loadsWithBoardDate = safeLoads.map(load => ({
        ...load,
        is_active: true,
        board_date: today,
        archived_at: null,
        dispatch_status: "open",
      }));
      
      const { error: insertError } = await supabase
        .from("loads")
        .upsert(loadsWithBoardDate, {
          onConflict: "agency_id,template_type,load_number",
          ignoreDuplicates: false,
        });
      
      if (insertError) {
        console.error("Upsert error:", insertError);
        
        await supabase.from("email_import_logs").insert({
          agency_id: agency.id,
          sender_email: senderEmail,
          subject: subject,
          status: "failed",
          error_message: insertError.message,
          raw_headers: emailHeaders,
        });
        
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      importedCount = safeLoads.length;
      
      // Archive loads NOT in the new batch (never delete)
      const adelNotIn = `(${currentLoadNumbers.map((n) => `"${String(n).replace(/"/g, "")}"`).join(",")})`;
      const { data: archivedData } = await supabase
        .from("loads")
        .update({
          dispatch_status: "archived",
          is_active: false,
          archived_at: new Date().toISOString(),
        })
        .eq("agency_id", agency.id)
        .eq("template_type", "adelphia_xlsx")
        .neq("dispatch_status", "archived")
        .is("booked_at", null)
        .not("load_number", "in", adelNotIn)
        .select("id");
      
      archivedCountAdel = archivedData?.length || 0;
      console.log(`Archived ${archivedCountAdel} Adelphia loads not in current batch`);
      
      // Post new loads to X
      await postLoadsToX(safeLoads);
    }
    
    console.log(`Imported ${importedCount} loads`);

    const totalActiveAdelphia = await countActiveLoadsForTemplate(supabase, agency.id, "adelphia_xlsx");

    // Log successful import (raw_headers merged into load_activity_logs.meta by DB trigger)
    await supabase.from("email_import_logs").insert({
      agency_id: agency.id,
      sender_email: senderEmail,
      subject: subject,
      status: "success",
      imported_count: importedCount,
      raw_headers: mergeImportActivityHeaders(emailHeaders, {
        template_type: "adelphia_xlsx",
        source: "Adelphia Import",
        new: newCountAdel,
        updated: updatedCountAdel,
        dupes_dropped: dupesDroppedAdel,
        removed: archivedCountAdel,
        supports_removal: true,
        new_count: newCountAdel,
        updated_count: updatedCountAdel,
        removed_count: archivedCountAdel,
        total_count: totalActiveAdelphia,
      }),
    });

    await recordSuccessfulInboundDedupe(supabase, adelphiaDedupeKey);
    
    // Note: No confirmation emails to external senders - import logs are visible in admin dashboard
    
    return new Response(JSON.stringify({
      success: true,
      imported: importedCount,
      agency: agency.name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    }

  } catch (error: unknown) {
    console.error("Email import error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
