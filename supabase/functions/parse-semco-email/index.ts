import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGENCY_ID = "25127efb-6eef-412a-a5d0-3d8242988323";
const TEMPLATE_TYPE = "semco_email";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function lastDayOfShipMonth(isoYmd: string): string {
  const d = new Date(isoYmd + "T12:00:00Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}-${String(last).padStart(2, "0")}`;
}

function normalizeAttachmentBase64(raw: string): Uint8Array {
  const s = String(raw).trim();
  const dataUrl = s.match(/^data:application\/pdf;base64,(.+)$/is);
  const b64 = dataUrl ? dataUrl[1].replace(/\s/g, "") : s.replace(/\s/g, "");
  return decodeBase64(b64);
}

async function extractPDFText(base64Data: string): Promise<string> {
  const { default: pdfParse } = await import("npm:pdf-parse@1.1.1");
  const buffer = normalizeAttachmentBase64(base64Data);
  const result = await pdfParse(buffer);
  return typeof result?.text === "string" ? result.text : "";
}

function parseSemcoText(text: string) {
  const loads: Array<{
    pickup_city: string;
    pickup_state: string;
    dest_city: string;
    dest_state: string;
    rate_raw: number;
    load_call_script: string | null;
  }> = [];

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let inTable = false;
  let prevPickupCity = "";
  let prevPickupState = "";
  let prevDestCity = "";
  let prevDestState = "";

  for (const line of lines) {
    if (/origin/i.test(line) && /destination/i.test(line)) {
      inTable = true;
      continue;
    }
    if (/ABOVE LOADS ARE FOR/i.test(line)) break;
    if (!inTable) continue;

    const parts = line.split(/\s{2,}|\t/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) continue;

    const originRaw = parts[0];
    const destRaw = parts[1];
    const rateRaw = parts[2];
    const notesRaw = parts.slice(3).join(" ").trim() || null;

    const invoice = parseFloat(rateRaw.replace(/[$,]/g, ""));
    if (Number.isNaN(invoice) || invoice <= 0) continue;

    let pickup_city: string;
    let pickup_state: string;
    let dest_city: string;
    let dest_state: string;

    if (originRaw === '"' || originRaw === '""') {
      pickup_city = prevPickupCity;
      pickup_state = prevPickupState;
    } else {
      const p = originRaw.split(" ");
      pickup_state = p.pop()!.toUpperCase();
      pickup_city = p.join(" ").trim();
      prevPickupCity = pickup_city;
      prevPickupState = pickup_state;
    }

    if (destRaw === '"' || destRaw === '""') {
      dest_city = prevDestCity;
      dest_state = prevDestState;
    } else {
      const p = destRaw.split(" ");
      dest_state = p.pop()!.toUpperCase();
      dest_city = p.join(" ").trim();
      prevDestCity = dest_city;
      prevDestState = dest_state;
    }

    const cleanNotes = notesRaw
      ? notesRaw.replace(/\*+NEW\*+/gi, "").trim() || null
      : null;

    loads.push({
      pickup_city,
      pickup_state,
      dest_city,
      dest_state,
      rate_raw: invoice,
      load_call_script: cleanNotes,
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

    let semcoText: string | null = null;

    for (const att of pdfAttachments) {
      if (!att.content) continue;
      const text = await extractPDFText(att.content);
      if (/semco stone/i.test(text) || /LOAD SHEET/i.test(text)) {
        semcoText = text;
        break;
      }
    }

    if (!semcoText) {
      return new Response(
        JSON.stringify({ error: "No SEMCO load sheet detected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsedLoads = parseSemcoText(semcoText);

    if (parsedLoads.length === 0) {
      return new Response(
        JSON.stringify({ error: "No loads parsed from SEMCO PDF" }),
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
      const target_pay = Math.round(inv * 0.8 * 100) / 100;
      const max_pay = Math.round(inv * 0.85 * 100) / 100;
      const target_commission = Math.round(inv * 0.2 * 100) / 100;
      const max_commission = Math.round(inv * 0.15 * 100) / 100;
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
      raw_headers: { template_type: TEMPLATE_TYPE },
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
