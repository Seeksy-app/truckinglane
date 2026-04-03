import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { computeCommissions, computeTargetPayMaxPay } from "../_shared/targetPay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGENCY_ID = "25127efb-6eef-412a-a5d0-3d8242988323";
const TEMPLATE_TYPE = "semco_email";
const MODEL = "claude-sonnet-4-20250514";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function lastDayOfShipMonth(isoYmd: string): string {
  const d = new Date(isoYmd + "T12:00:00Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}-${String(last).padStart(2, "0")}`;
}

/** Raw base64 for Anthropic PDF document (no data-URL prefix, no whitespace). */
function stripPdfBase64ForClaude(raw: string): string {
  const s = String(raw).trim();
  const m = s.match(/^data:application\/pdf;base64,(.+)$/is);
  return (m ? m[1] : s).replace(/\s/g, "");
}

type SemcoClaudeRow = {
  pickup_city: string;
  pickup_state: string;
  dest_city: string;
  dest_state: string;
  rate_raw: number;
  notes: string | null;
};

type ParsedSemcoLoad = {
  pickup_city: string;
  pickup_state: string;
  dest_city: string;
  dest_state: string;
  rate_raw: number;
  load_call_script: string | null;
};

function normalizeClaudeRow(x: unknown): SemcoClaudeRow | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const pickup_city = String(o.pickup_city ?? "").trim();
  const pickup_state = String(o.pickup_state ?? "").trim().toUpperCase().slice(0, 2);
  const dest_city = String(o.dest_city ?? "").trim();
  const dest_state = String(o.dest_state ?? "").trim().toUpperCase().slice(0, 2);
  const rate_raw = Number(o.rate_raw);
  if (!pickup_city || !pickup_state || !dest_city || !dest_state || Number.isNaN(rate_raw) || rate_raw <= 0) {
    return null;
  }
  const n = o.notes;
  const notes =
    n == null || n === ""
      ? null
      : String(n).replace(/\*+NEW\*+/gi, "").trim() || null;
  return { pickup_city, pickup_state, dest_city, dest_state, rate_raw, notes };
}

async function extractSemcoLoadsWithClaude(
  pdfBase64Raw: string,
  anthropicKey: string,
): Promise<ParsedSemcoLoad[]> {
  const data = stripPdfBase64ForClaude(pdfBase64Raw);
  if (!data) throw new Error("Empty PDF base64");

  const prompt = `You are extracting freight loads from a SEMCO Stone load sheet PDF (exported from Microsoft Excel).

The document contains a table with columns:
- Origin: CITY then 2-letter US state
- Destination: CITY then 2-letter US state  
- Rate: dollar amount (may include $ and commas)
- Notes: optional text

Rules:
- A double-quote character " in the Origin or Destination cell means "same as the row above" for that column only. Resolve every output row to the full city and state (never output " as a place).
- Stop before any disclaimer line that begins with "ABOVE LOADS ARE FOR".
- Skip header rows and non-data rows.
- All loads are flatbed, 48000 lbs, no tarp, commodity Landscaping Stone — you only extract the table; do not add those fields to JSON.

Return ONLY a valid JSON array (no markdown fences, no commentary). Example shape:
[{"pickup_city":"SAN SABA","pickup_state":"TX","dest_city":"PERRYVILLE","dest_state":"MO","rate_raw":1900,"notes":null}]

Each object must have: pickup_city, pickup_state (2 letters), dest_city, dest_state (2 letters), rate_raw (number only, no $ or commas), notes (string or null).
Include every data row from the load table.`;

  const body = {
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 800)}`);
  }

  const resp = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = resp.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Claude did not return a JSON array");

  let arr: unknown;
  try {
    arr = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Claude returned invalid JSON array");
  }
  if (!Array.isArray(arr)) throw new Error("Claude JSON root is not an array");

  const loads: ParsedSemcoLoad[] = [];
  for (const item of arr) {
    const row = normalizeClaudeRow(item);
    if (!row) continue;
    loads.push({
      pickup_city: row.pickup_city,
      pickup_state: row.pickup_state,
      dest_city: row.dest_city,
      dest_state: row.dest_state,
      rate_raw: row.rate_raw,
      load_call_script: row.notes,
    });
  }
  return loads;
}

async function hashLoad(
  pickup_city: string,
  pickup_state: string,
  dest_city: string,
  dest_state: string,
  rate_raw: number,
): Promise<string> {
  const key = `${pickup_city}|${pickup_state}|${dest_city}|${dest_state}|${rate_raw}`;
  const encoded = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function loadNumberFromSourceHash(sourceHash: string): string {
  return `SEMCO-${sourceHash.slice(0, 32)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const attachments = (body.attachments ??
      (body.data as Record<string, unknown> | undefined)?.attachments ??
      []) as Array<{ filename?: string; content?: string; contentType?: string }>;

    const pdfAttachments = attachments.filter(
      (a) =>
        a.contentType === "application/pdf" ||
        a.filename?.toLowerCase().endsWith(".pdf"),
    );

    if (pdfAttachments.length === 0) {
      return new Response(JSON.stringify({ error: "No PDF attachment found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedLoads: ParsedSemcoLoad[] = [];
    let lastError: string | null = null;

    for (const att of pdfAttachments) {
      if (!att.content) continue;
      try {
        const loads = await extractSemcoLoadsWithClaude(att.content, anthropicKey);
        if (loads.length > 0) {
          parsedLoads = loads;
          break;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error("parse-semco-email Claude:", lastError);
      }
    }

    if (parsedLoads.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No loads parsed from SEMCO PDF",
          ...(lastError ? { detail: lastError } : {}),
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const shipDate = today;
    const purgeDate = lastDayOfShipMonth(shipDate);

    const rows: Record<string, unknown>[] = [];
    for (const load of parsedLoads) {
      const source_hash = await hashLoad(
        load.pickup_city,
        load.pickup_state,
        load.dest_city,
        load.dest_state,
        load.rate_raw,
      );
      const load_number = loadNumberFromSourceHash(source_hash);
      const inv = load.rate_raw;
      const { target_pay, max_pay } = computeTargetPayMaxPay(false, inv, inv);
      const comm = computeCommissions({
        isPerTon: false,
        rateRaw: inv,
        customerInvoiceTotal: inv,
        targetPay: target_pay,
        maxPay: max_pay,
        weightLbs: null,
      });
      const target_commission = comm.target_commission;
      const max_commission = comm.max_commission;
      const pickupRaw = [load.pickup_city, load.pickup_state].filter(Boolean).join(", ");
      const destRaw = [load.dest_city, load.dest_state].filter(Boolean).join(", ");
      const script =
        load.load_call_script?.trim() ||
        `SEMCO stone from ${pickupRaw} to ${destRaw}. Rate $${inv.toLocaleString()}.`;

      rows.push({
        agency_id: AGENCY_ID,
        template_type: TEMPLATE_TYPE,
        load_number,
        dispatch_status: "open",
        status: "open",
        is_active: true,
        board_date: today,
        pickup_city: load.pickup_city,
        pickup_state: load.pickup_state,
        pickup_location_raw: pickupRaw || null,
        dest_city: load.dest_city,
        dest_state: load.dest_state,
        dest_location_raw: destRaw || null,
        rate_raw: inv,
        customer_invoice_total: inv,
        target_pay,
        max_pay,
        target_commission,
        max_commission,
        commission_target_pct: 0.2,
        commission_max_pct: 0.15,
        is_per_ton: false,
        trailer_type: "F",
        weight_lbs: 48000,
        tarp_required: false,
        commodity: "Landscaping Stone",
        customer_name: "SEMCO Stone",
        load_call_script: script,
        ship_date: shipDate,
        purge_date: purgeDate,
        dat_posted_at: null,
        archived_at: null,
        source_row: {
          semco_source_hash: source_hash,
          parser: "parse-semco-email",
          claude_model: MODEL,
        },
      });
    }

    const { error } = await supabase.from("loads").upsert(rows, {
      onConflict: "agency_id,template_type,load_number",
      ignoreDuplicates: false,
    });

    if (error) throw error;

    const sender =
      typeof body.from === "string"
        ? body.from
        : typeof (body.data as Record<string, unknown> | undefined)?.from === "string"
        ? String((body.data as Record<string, unknown>).from)
        : "semco-pdf-webhook";

    const subject =
      typeof body.subject === "string"
        ? body.subject
        : typeof (body.data as Record<string, unknown> | undefined)?.subject === "string"
        ? String((body.data as Record<string, unknown>).subject)
        : "(SEMCO PDF)";

    await supabase.from("email_import_logs").insert({
      agency_id: AGENCY_ID,
      sender_email: sender,
      subject,
      status: "success",
      imported_count: rows.length,
      raw_headers: { template_type: TEMPLATE_TYPE, parser: "claude-pdf" },
    });

    return new Response(
      JSON.stringify({ success: true, loads_upserted: rows.length, template_type: TEMPLATE_TYPE }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    console.error("parse-semco-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
