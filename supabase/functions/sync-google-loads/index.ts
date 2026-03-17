import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-openclaw-key",
};

const AGENCY_ID = "25127efb-6eef-412a-a5d0-3d8242988323";
const TEMPLATE_TYPE = "oldcastle_gsheet";

// ---------- helpers ----------

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

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
}

function calculateRateFields(rateRaw: number | null) {
  if (rateRaw === null || rateRaw === 0) {
    return {
      rate_raw: null, is_per_ton: false,
      customer_invoice_total: 0, target_pay: 0, target_commission: 0,
      max_pay: 0, max_commission: 0,
      commission_target_pct: 0.20, commission_max_pct: 0.15,
    };
  }
  const invoiceTotal = Math.round(rateRaw);
  return {
    rate_raw: rateRaw, is_per_ton: false,
    customer_invoice_total: invoiceTotal,
    target_pay: Math.round(invoiceTotal * 0.80),
    target_commission: Math.round(invoiceTotal * 0.20),
    max_pay: Math.round(invoiceTotal * 0.85),
    max_commission: Math.round(invoiceTotal * 0.15),
    commission_target_pct: 0.20, commission_max_pct: 0.15,
  };
}

// ---------- parsing ----------

interface ParsedLoad {
  equipment: string;
  shipper_city: string;
  shipper_state: string;
  delivery_city: string;
  delivery_state: string;
  ready_date: string | null;
  rate: number | null;
  weight: number | null;
  sheet_name: string;
}

function parseAllSheets(buffer: ArrayBuffer): ParsedLoad[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const allLoads: ParsedLoad[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"]);

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

    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
      headers.push(cell ? String(cell.v).toLowerCase().trim() : "");
    }

    const colMap: Record<string, number> = {};
    const targetCols = ["equipment", "shipper city", "shipper state", "delivery city", "delivery state", "ready date", "rate"];
    for (const target of targetCols) {
      const idx = headers.findIndex(h => h.includes(target) || h === target);
      if (idx >= 0) colMap[target] = idx;
    }
    const weightIdx = headers.findIndex(h => h.includes("weight"));
    if (weightIdx >= 0) colMap["weight"] = weightIdx;

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

      allLoads.push({
        equipment,
        shipper_city: getVal("shipper city"),
        shipper_state: getVal("shipper state"),
        delivery_city: deliveryCity,
        delivery_state: getVal("delivery state") || getVal("shipper state"),
        ready_date: getVal("ready date") || null,
        rate: parseNumber(getVal("rate")),
        weight: parseNumber(getVal("weight")),
        sheet_name: sheetName,
      });
    }

    console.log(`Sheet "${sheetName}": found ${allLoads.length} loads so far`);
  }

  return allLoads;
}

// ---------- mapping ----------

function mapToLoad(parsed: ParsedLoad): Record<string, unknown> {
  const pickupRaw = [parsed.shipper_city, parsed.shipper_state].filter(Boolean).join(", ");
  const destRaw = [parsed.delivery_city, parsed.delivery_state].filter(Boolean).join(", ");
  const contentKey = `${pickupRaw}|${destRaw}|${parsed.rate}|${parsed.equipment}|${parsed.sheet_name}`;
  const loadNumber = `OC-${simpleHash(contentKey)}`;
  const rateFields = calculateRateFields(parsed.rate);

  const trailerType = parsed.equipment.toUpperCase().includes("VAN") ? "Van"
    : parsed.equipment.toUpperCase().includes("FLAT") ? "Flatbed"
    : parsed.equipment || null;

  const load: Record<string, unknown> = {
    agency_id: AGENCY_ID,
    template_type: TEMPLATE_TYPE,
    load_number: loadNumber,
    pickup_city: parsed.shipper_city || null,
    pickup_state: parsed.shipper_state || null,
    pickup_location_raw: pickupRaw || null,
    dest_city: parsed.delivery_city || null,
    dest_state: parsed.delivery_state || null,
    dest_location_raw: destRaw || null,
    ship_date: parseDate(parsed.ready_date) || new Date().toISOString().split("T")[0],
    delivery_date: parseDate(parsed.ready_date) || new Date().toISOString().split("T")[0],
    trailer_type: trailerType,
    weight_lbs: parsed.weight,
    ...rateFields,
    commodity: null,
    miles: null,
    tarp_required: false,
    status: "open",
    source_row: { sheet: parsed.sheet_name, equipment: parsed.equipment },
  };

  load.load_call_script = `Load ${loadNumber}: ${parsed.equipment} from ${pickupRaw} to ${destRaw}. Rate $${parsed.rate || 'TBD'}.`;
  return load;
}

// ---------- core sync logic ----------

async function syncLoads(buffer: ArrayBuffer, source: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const parsedLoads = parseAllSheets(buffer);
  console.log(`[${source}] Parsed ${parsedLoads.length} total loads`);

  if (parsedLoads.length === 0) {
    return { success: true, imported: 0, message: "No loads found in sheet", source };
  }

  const mappedLoads = parsedLoads.map(mapToLoad);

  const loadsByNumber = new Map<string, Record<string, unknown>>();
  for (const load of mappedLoads) {
    loadsByNumber.set(load.load_number as string, load);
  }
  const safeLoads = Array.from(loadsByNumber.values());
  console.log(`[${source}] ${safeLoads.length} unique loads after dedup`);

  // Archive existing active non-booked oldcastle loads
  const { data: archivedData, error: archiveError } = await supabase
    .from("loads")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("agency_id", AGENCY_ID)
    .eq("template_type", TEMPLATE_TYPE)
    .eq("is_active", true)
    .is("booked_at", null)
    .select("id");

  if (archiveError) {
    console.error("Archive error:", archiveError);
    throw new Error(archiveError.message);
  }

  const archivedCount = archivedData?.length || 0;
  console.log(`[${source}] Archived ${archivedCount} existing loads`);

  // Upsert new loads
  const today = new Date().toISOString().split("T")[0];
  const loadsWithMeta = safeLoads.map(load => ({
    ...load,
    is_active: true,
    board_date: today,
    archived_at: null,
  }));

  const { error: upsertError } = await supabase
    .from("loads")
    .upsert(loadsWithMeta, {
      onConflict: "agency_id,template_type,load_number",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    console.error("Upsert error:", upsertError);
    throw new Error(upsertError.message);
  }

  // Also save the uploaded file to storage for audit
  if (source === "openclaw-upload") {
    await supabase.storage
      .from("load-imports")
      .upload(`oldcastle-latest.xlsx`, new Blob([buffer]), {
        upsert: true,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
  }

  console.log(`[${source}] Upserted ${safeLoads.length} loads. Done!`);

  return {
    success: true,
    imported: safeLoads.length,
    archived: archivedCount,
    sheets_processed: new Set(parsedLoads.map(l => l.sheet_name)).size,
    source,
  };
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== SYNC-GOOGLE-LOADS START ===");

    const openclawKey = req.headers.get("x-openclaw-key");
    const expectedKey = Deno.env.get("OPENCLAW_UPLOAD_KEY");
    const contentType = req.headers.get("content-type") || "";

    // ── MODE 1: OpenClaw uploads .xlsx via POST ──
    if (openclawKey && expectedKey && openclawKey === expectedKey) {
      console.log("Mode: OpenClaw upload");

      const buffer = await req.arrayBuffer();
      if (buffer.byteLength < 100) {
        return new Response(JSON.stringify({ error: "Empty or invalid file" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Received ${buffer.byteLength} bytes from OpenClaw`);
      const result = await syncLoads(buffer, "openclaw-upload");

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE 2: Legacy Google Sheets fetch (cron / manual) ──
    console.log("Mode: Google Sheets fetch");
    const SPREADSHEET_ID = "1GkWErUwHLU6x51kRntqTKCi2t6djIl1d25287_IStr0";
    const exportUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=xlsx`;
    console.log("Fetching:", exportUrl);

    const fetchRes = await fetch(exportUrl);
    if (!fetchRes.ok) {
      const errText = await fetchRes.text();
      console.error("Google Sheets fetch failed:", fetchRes.status, errText);
      return new Response(JSON.stringify({ error: `Google Sheets fetch failed: ${fetchRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buffer = await fetchRes.arrayBuffer();
    console.log(`Downloaded ${buffer.byteLength} bytes from Google`);
    const result = await syncLoads(buffer, "google-fetch");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
