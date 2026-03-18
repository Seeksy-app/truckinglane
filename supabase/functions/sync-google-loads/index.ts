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
  notes: string;
}

// Extract city and state from a sheet tab name like "Archbold, OH" or "ZEELAND MI"
function parseSheetLocation(sheetName: string): { city: string; state: string } {
  const cleaned = sheetName.trim();
  // Try "City, ST" format
  const commaMatch = cleaned.match(/^(.+),\s*([A-Za-z]{2})$/);
  if (commaMatch) return { city: commaMatch[1].trim(), state: commaMatch[2].toUpperCase() };
  // Try "CITY ST" format (last 2-char word is state)
  const spaceMatch = cleaned.match(/^(.+)\s+([A-Za-z]{2})$/);
  if (spaceMatch) return { city: spaceMatch[1].trim(), state: spaceMatch[2].toUpperCase() };
  return { city: cleaned, state: "" };
}

// Known header keywords to detect the header row
const HEADER_KEYWORDS = ["due date", "city", "state", "rate", "equipment", "pick up", "deliver"];

function findHeaderRow(sheet: XLSX.WorkSheet, range: XLSX.Range): number {
  for (let r = 0; r <= Math.min(15, range.e.r); r++) {
    const rowTexts: string[] = [];
    for (let c = 0; c <= Math.min(10, range.e.c); c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) rowTexts.push(String(cell.v).toLowerCase().trim());
    }
    const joined = rowTexts.join(" ");
    // Need at least 2 header keywords to confirm it's a header row
    const matches = HEADER_KEYWORDS.filter(kw => joined.includes(kw));
    if (matches.length >= 2) return r;
  }
  return -1;
}

function parseAllSheets(buffer: ArrayBuffer): ParsedLoad[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const allLoads: ParsedLoad[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;

    // Skip meta/summary sheets
    const lowerName = sheetName.toLowerCase();
    if (lowerName.includes("available loads at other") || lowerName.includes("summary") || lowerName.includes("template")) {
      console.log(`Skipping meta sheet "${sheetName}"`);
      continue;
    }

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const headerRow = findHeaderRow(sheet, range);

    if (headerRow === -1) {
      console.log(`Skipping sheet "${sheetName}" - no recognizable header row`);
      continue;
    }

    // Read headers
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
      headers.push(cell ? String(cell.v).toLowerCase().trim() : "");
    }
    console.log(`Sheet "${sheetName}" headers (row ${headerRow}): [${headers.filter(Boolean).join(", ")}]`);

    // Map columns flexibly
    const colMap: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!h) continue;
      if (h.includes("due date") || h === "date") colMap["due_date"] = i;
      else if (h === "city" && colMap["city"] === undefined) colMap["city"] = i;
      else if (h === "city" && colMap["city"] !== undefined) colMap["city2"] = i; // second city column (Waterloo format)
      else if (h === "state") colMap["state"] = i;
      else if (h.includes("rate")) colMap["rate"] = i;
      else if (h.includes("equipment")) colMap["equipment"] = i;
      else if (h.includes("note")) colMap["notes"] = i;
      else if (h.includes("weight")) colMap["weight"] = i;
    }

    // Pickup location from sheet tab name
    const pickup = parseSheetLocation(sheetName);

    let sheetLoadCount = 0;
    let skippedRows = 0;
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const getVal = (col: string): string => {
        const idx = colMap[col];
        if (idx === undefined) return "";
        const cell = sheet[XLSX.utils.encode_cell({ r, c: idx })];
        return cell ? String(cell.v).trim() : "";
      };

      // Gather all values from the row
      const cityVal = getVal("city");
      const rateVal = getVal("rate");
      const equipment = getVal("equipment") || "";
      const dueDateVal = getVal("due_date");
      const notes = getVal("notes") || "";
      const stateVal = getVal("state") || getVal("city2") || "";
      const rate = parseNumber(rateVal);

      // Check if row has ANY meaningful data across all columns
      const hasAnyData = cityVal || rateVal || equipment || dueDateVal || stateVal;
      if (!hasAnyData) continue;

      // Skip rows that are clearly labels/instructions, not data
      const allText = `${dueDateVal} ${cityVal} ${equipment} ${notes}`.toUpperCase();
      const skipPatterns = ["FLATBED ONLY", "MUST HAVE", "SHIPPING HOURS", "ALL LOADS ARE", "CONTACT US", "PLEASE CALL"];
      if (skipPatterns.some(p => allText.includes(p)) && !rate) {
        skippedRows++;
        continue;
      }

      // Debug: log first few rows per sheet
      if (sheetLoadCount < 3) {
        console.log(`  Row ${r}: date="${dueDateVal}" city="${cityVal}" state="${stateVal}" rate="${rateVal}" equip="${equipment}"`);
      }

      const deliveryCity = cityVal || null;
      const deliveryState = stateVal || null;

      allLoads.push({
        equipment,
        shipper_city: pickup.city,
        shipper_state: pickup.state,
        delivery_city: deliveryCity,
        delivery_state: deliveryState,
        ready_date: dueDateVal || null,
        rate,
        weight: parseNumber(getVal("weight")),
        sheet_name: sheetName,
        notes,
      });
      sheetLoadCount++;
    }

    console.log(`Sheet "${sheetName}": found ${sheetLoadCount} loads`);
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

  let trailerType: string | null = null;
  if (parsed.equipment) {
    const eq = parsed.equipment.toUpperCase();
    trailerType = eq.includes("VAN") ? "Van"
      : eq.includes("FLAT") ? "Flatbed"
      : parsed.equipment;
  }

  // Build notes from sheet notes + any extra context
  const noteParts: string[] = [];
  if (parsed.notes) noteParts.push(parsed.notes);
  const commodity = null;

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
    commodity,
    miles: null,
    tarp_required: false,
    status: "open",
    source_row: { sheet: parsed.sheet_name, equipment: parsed.equipment, notes: parsed.notes },
  };

  const eqLabel = parsed.equipment || trailerType || "Load";
  load.load_call_script = `Load ${loadNumber}: ${eqLabel} from ${pickupRaw} to ${destRaw}. Rate $${parsed.rate || 'TBD'}.`;
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
