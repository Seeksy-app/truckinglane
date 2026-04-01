import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CENTURY_AGENCY_ID = "25127efb-6eef-412a-a5d0-3d8242988323";
/** Senders allowed to hit this Century PDF parser. */
const PARSE_CENTURY_ALLOWED_SENDERS = new Set<string>([
  "ardell@centuryent.com",
  "stephen@dltransport.com",
]);
const MODEL = "claude-sonnet-4-20250514";

function subjectHasCenturyKeywords(subject: string): boolean {
  const s = subject.toLowerCase();
  return s.includes("century") || s.includes("loads");
}

type Extracted = {
  pickup_city: string;
  pickup_state: string;
  dest_city: string;
  dest_state: string;
  rate_per_ton: number;
  destination_company: string;
  contains_bales: boolean;
};

function lastDayOfShipMonth(isoYmd: string): string {
  const d = new Date(isoYmd + "T12:00:00Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}-${String(last).padStart(2, "0")}`;
}

function shipDateFromReceived(receivedIso: string): string {
  const d = new Date(receivedIso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

async function hash3(pickupSt: string, destSt: string, salt: string): Promise<string> {
  const enc = new TextEncoder().encode(`${pickupSt}|${destSt}|${salt}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 3).toUpperCase();
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchInboundAttachmentBuffer(
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

async function extractWithClaude(pdfBase64: string, anthropicKey: string): Promise<Extracted> {
  const body = {
    model: MODEL,
    max_tokens: 1500,
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
            text: `You are parsing a freight load PDF. Return ONLY valid JSON (no markdown) with these keys:
{"pickup_city":"","pickup_state":"2-letter US state","dest_city":"","dest_state":"2-letter US state","rate_per_ton":0,"destination_company":"","contains_bales":false}

rate_per_ton: numeric dollars per ton from a pattern like $85/NT or $85 / NT (number only).
destination_company: consignee / mill / recycler at destination (e.g. Gerdau Ameristeel, Bluescope Recycling, FPT).
contains_bales: true if the letters BALES appear anywhere in the document (any case), else false.`,
          },
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
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return JSON");
  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  return {
    pickup_city: String(parsed.pickup_city ?? "").trim(),
    pickup_state: String(parsed.pickup_state ?? "").trim().toUpperCase().slice(0, 2),
    dest_city: String(parsed.dest_city ?? "").trim(),
    dest_state: String(parsed.dest_state ?? "").trim().toUpperCase().slice(0, 2),
    rate_per_ton: Number(parsed.rate_per_ton) || 0,
    destination_company: String(parsed.destination_company ?? "").trim(),
    contains_bales: Boolean(parsed.contains_bales),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const payload = await req.json();
    const eventType = payload.type;
    if (eventType && eventType !== "email.received") {
      return new Response(JSON.stringify({ ignored: true, event_type: eventType }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let senderEmail = payload.from || payload.sender || payload.email?.from ||
      (typeof payload.data?.from === "string" ? payload.data.from : payload.data?.from?.email);
    const m = senderEmail && String(senderEmail).match(/<([^>]+)>/);
    if (m) senderEmail = m[1];
    const clean = String(senderEmail || "").toLowerCase().trim();
    if (!PARSE_CENTURY_ALLOWED_SENDERS.has(clean)) {
      return new Response(
        JSON.stringify({ error: "Sender not allowed for Century PDF import" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const subject = String(payload.subject || payload.data?.subject || payload.email?.subject || "");
    // Case-insensitive "century" or "loads" in subject; ardell@centuryent.com may use any subject.
    const subjectOk = subjectHasCenturyKeywords(subject) || clean === "ardell@centuryent.com";
    if (!subjectOk) {
      return new Response(
        JSON.stringify({
          error: 'Subject must contain "century" or "loads" (case insensitive) unless from ardell@centuryent.com',
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const attachments = payload.attachments || payload.data?.attachments || payload.email?.attachments || [];
    const pdfs = attachments.filter((a: { filename?: string }) =>
      a.filename?.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length !== 5) {
      return new Response(JSON.stringify({ error: `Expected 5 PDF attachments, got ${pdfs.length}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailId = payload.data?.email_id || payload.email_id;
    const emailHeaders = payload.headers || payload.data?.headers || {};

    const receivedRaw =
      (typeof payload.data?.created_at === "string" && payload.data.created_at) ||
      (typeof payload.created_at === "string" && payload.created_at) ||
      new Date().toISOString();
    const receivedIso = new Date(receivedRaw).toISOString();
    const shipDate = shipDateFromReceived(receivedIso);
    const purgeDate = lastDayOfShipMonth(shipDate);

    const finalRows: Record<string, unknown>[] = [];
    let j = 0;
    for (const att of pdfs) {
      j += 1;
      const buf = await fetchInboundAttachmentBuffer(emailId, att, resendApiKey);
      const pdfBase64 = uint8ToBase64(new Uint8Array(buf));
      const ext = await extractWithClaude(pdfBase64, anthropicKey);
      const rate = ext.rate_per_ton;
      const h = await hash3(ext.pickup_state, ext.dest_state, `${j}-${ext.pickup_city}-${ext.dest_city}`);
      const loadNumber = `CENT-${ext.pickup_state}-${ext.dest_state}-${h}`;
      const commodity = ext.contains_bales ? "baled aluminum" : "crushed cars";

      finalRows.push({
        agency_id: CENTURY_AGENCY_ID,
        template_type: "Century",
        load_number: loadNumber,
        customer_name: ext.destination_company || null,
        pickup_city: ext.pickup_city || null,
        pickup_state: ext.pickup_state || null,
        pickup_location_raw: ext.pickup_city && ext.pickup_state
          ? `${ext.pickup_city}, ${ext.pickup_state}`
          : null,
        dest_city: ext.dest_city || null,
        dest_state: ext.dest_state || null,
        dest_location_raw: ext.dest_city && ext.dest_state ? `${ext.dest_city}, ${ext.dest_state}` : null,
        ship_date: shipDate,
        purge_date: purgeDate,
        delivery_date: null,
        trailer_type: "Flatbed",
        weight_lbs: null,
        is_per_ton: true,
        customer_invoice_total: 0,
        target_pay: Math.round(rate - 10),
        max_pay: Math.round(rate - 5),
        rate_raw: rate,
        commodity,
        dispatch_status: "open",
        status: "open",
        is_active: true,
        dat_posted_at: null,
        archived_at: null,
        source_row: { century_pdf: att.filename ?? "load.pdf", index: j },
      });
    }

    const centuryTemplate = "Century";
    const byNum = new Map<string, Record<string, unknown>>();
    for (const row of finalRows) {
      byNum.set(String(row.load_number), row);
    }
    const safeRows = Array.from(byNum.values());
    const dupesDropped = finalRows.length - safeRows.length;
    const nums = safeRows.map((r) => String(r.load_number));
    const { data: existRows } = await supabase
      .from("loads")
      .select("load_number")
      .eq("agency_id", CENTURY_AGENCY_ID)
      .eq("template_type", centuryTemplate)
      .in("load_number", nums);
    const existingSet = new Set(
      (existRows ?? []).map((r: { load_number: string }) => String(r.load_number)),
    );
    const newCount = nums.filter((n) => !existingSet.has(n)).length;
    const updatedCount = nums.length - newCount;

    const { error: upsertError } = await supabase.from("loads").upsert(safeRows, {
      onConflict: "agency_id,template_type,load_number",
      ignoreDuplicates: false,
    });

    if (upsertError) {
      await supabase.from("email_import_logs").insert({
        agency_id: CENTURY_AGENCY_ID,
        sender_email: clean,
        subject,
        status: "failed",
        error_message: upsertError.message,
        raw_headers: emailHeaders,
      });
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mergedHeaders: Record<string, unknown> =
      emailHeaders && typeof emailHeaders === "object" && !Array.isArray(emailHeaders)
        ? { ...(emailHeaders as Record<string, unknown>) }
        : {};
    mergedHeaders.template_type = centuryTemplate;
    mergedHeaders.new = newCount;
    mergedHeaders.updated = updatedCount;
    mergedHeaders.dupes_dropped = dupesDropped;
    mergedHeaders.duplicates_removed = dupesDropped;
    mergedHeaders.supports_removal = false;

    await supabase.from("email_import_logs").insert({
      agency_id: CENTURY_AGENCY_ID,
      sender_email: clean,
      subject,
      status: "success",
      imported_count: safeRows.length,
      raw_headers: mergedHeaders,
    });

    return new Response(
      JSON.stringify({
        success: true,
        imported: safeRows.length,
        new: newCount,
        updated: updatedCount,
        dupes_dropped: dupesDropped,
        template_type: centuryTemplate,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("parse-century-email:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
