import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-openclaw-key",
};

const AGENCY_ID = "25127efb-6eef-412a-a5d0-3d8242988323";
const TEMPLATE_TYPE = "aljex_flat";

// ============= CSV PARSING =============

function indexToColumnLetter(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      const value = values[idx]?.trim() || "";
      row[header] = value;
      const colLetter = indexToColumnLetter(idx);
      row[`_col_${colLetter}`] = value;
    });
    rows.push(row);
  }
  return rows;
}

// Scrape / sync CSV: OPEN only (excludes COVERED). Keep aligned with src/lib/aljexLoadBoard.ts.
function scrapeAljexLoadsRowPassesStatusFilter(row: Record<string, string>): boolean {
  const raw = row["Status"] ?? row["Load Status"] ?? row["St"] ?? "";
  const s = String(raw).trim().toUpperCase();
  if (!s) return true;
  return s === "OPEN";
}

const ALJEX_SCRAPED_DISPATCH_STATUS = "available";

// ============= HELPERS =============

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
  return null;
}

function parseTarpRequired(value: string | undefined | null): boolean {
  if (!value) return false;
  return ["Y", "YES", "TRUE", "1"].includes(String(value).toUpperCase().trim());
}

function calculateRateFields(rateRaw: number | null, weightLbs: number | null, isPerTon: boolean) {
  if (rateRaw === null || rateRaw === 0) {
    return {
      rate_raw: null, is_per_ton: isPerTon,
      customer_invoice_total: 0, target_pay: 0, target_commission: 0,
      max_pay: 0, max_commission: 0,
      commission_target_pct: 0.20, commission_max_pct: 0.15,
    };
  }
  const weightTons = (weightLbs || 0) / 2000;
  const invoiceTotal = isPerTon && weightTons > 0
    ? Math.round(rateRaw * weightTons)
    : Math.round(rateRaw);
  return {
    rate_raw: rateRaw, is_per_ton: isPerTon,
    customer_invoice_total: invoiceTotal,
    target_pay: Math.round(invoiceTotal * 0.80),
    target_commission: Math.round(invoiceTotal * 0.20),
    max_pay: Math.round(invoiceTotal * 0.85),
    max_commission: Math.round(invoiceTotal * 0.15),
    commission_target_pct: 0.20,
    commission_max_pct: 0.15,
  };
}

function generateLoadCallScript(load: Record<string, unknown>): string {
  const isPerTon = load.is_per_ton;
  const rate = load.rate_raw;
  const rateStr = isPerTon ? `$${rate}/ton` : `$${rate} flat`;
  const invoiceTotal = load.customer_invoice_total;
  const invoiceStr = invoiceTotal ? `$${Number(invoiceTotal).toFixed(2)}` : "n/a";
  return `Load ${load.load_number}: Pickup ${load.pickup_location_raw}. Deliver ${load.dest_location_raw}. Ship date ${load.ship_date || "TBD"}. Weight ${load.weight_lbs || "n/a"} lbs. Length ${load.trailer_footage || "n/a"} ft. Tarp ${load.tarp_required ? "Yes" : "No"}. Rate ${rateStr}. Invoice est ${invoiceStr}. Notes: ${load.commodity || ""}`;
}

// ============= ALJEX ROW MAPPER =============

function mapAljexFlatRow(row: Record<string, string>): Record<string, unknown> {
  const loadNumber = row["Pro #"] || "";
  const pickupCity = row["Pickup City"] || "";
  const pickupState = row["Pickup State"] || "";
  const pickupZip = row["Pickup Zip"] || "";
  const destCity = row["Consignee City"] || "";
  const destState = row["Consignee State"] || "";
  const destZip = row["Consignee Zip"] || "";
  const pickupLocationRaw = [pickupCity, pickupState, pickupZip].filter(Boolean).join(", ");
  const destLocationRaw = [destCity, destState, destZip].filter(Boolean).join(", ");
  const rateNumeric = parseNumber(row["Rate"]) || parseNumber(row["LH Revenue"]);
  const weightLbs = parseNumber(row["Weight"]);
  // Column KE = T (per ton) or F (flat)
  const codeValue = (row["_col_KE"] || row["Code"] || "").toUpperCase().trim();
  const isPerTon = codeValue === "T";
  const rateFields = calculateRateFields(rateNumeric, weightLbs, isPerTon);

  const baseLoad: Record<string, unknown> = {
    agency_id: AGENCY_ID,
    template_type: TEMPLATE_TYPE,
    load_number: loadNumber,
    pickup_city: pickupCity || null,
    pickup_state: pickupState || null,
    pickup_zip: pickupZip || null,
    pickup_location_raw: pickupLocationRaw || null,
    dest_city: destCity || null,
    dest_state: destState || null,
    dest_zip: destZip || null,
    dest_location_raw: destLocationRaw || null,
    ship_date: parseDate(row["Ship Date"]),
    delivery_date: parseDate(row["Ship Date"]),
    trailer_type: row["Type of Shipment"] || null,
    dispatch_status: ALJEX_SCRAPED_DISPATCH_STATUS,
    trailer_footage: parseNumber(row["Footage"]),
    tarps: row["Tarps"] || null,
    tarp_size: row["Tarp Size"] || null,
    tarp_required: parseTarpRequired(row["Tarps"]),
    commodity: row["Description"] || null,
    miles: row["Miles/Units/Code/Class"] || row["Miles/Class"] || null,
    weight_lbs: weightLbs,
    ...rateFields,
    status: "open",
    source_row: row,
  };

  baseLoad.load_call_script = generateLoadCallScript(baseLoad);
  return baseLoad;
}

// ============= MAIN HANDLER =============

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth via x-openclaw-key (same pattern as sync-google-loads)
    const openclawKey = req.headers.get("x-openclaw-key");
    const expectedKey = Deno.env.get("OPENCLAW_UPLOAD_KEY");
    if (!openclawKey || openclawKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Accept CSV as raw body
    const csvText = await req.text();
    if (!csvText || csvText.trim().length === 0) {
      return new Response(JSON.stringify({ error: "No CSV data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Parsing Aljex CSV (${csvText.length} bytes)`);
    const parsed = parseCSV(csvText);
    const rows = parsed.filter(scrapeAljexLoadsRowPassesStatusFilter);
    console.log(`Parsed ${parsed.length} rows, ${rows.length} OPEN after status filter`);

    if (rows.length === 0) {
      const msg = parsed.length === 0
        ? "No data rows in CSV"
        : "No OPEN loads after status filter (COVERED rows excluded)";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map rows, filter out those without load numbers
    let mappedLoads = rows.map(row => mapAljexFlatRow(row));
    mappedLoads = mappedLoads.filter(load => load.load_number);
    console.log(`${mappedLoads.length} valid loads after filtering`);

    if (mappedLoads.length === 0) {
      return new Response(JSON.stringify({ error: "No valid loads (missing Pro #)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate by load_number
    const loadsByNumber = new Map<string, Record<string, unknown>>();
    for (const load of mappedLoads) {
      loadsByNumber.set(load.load_number as string, load);
    }
    const safeLoads = Array.from(loadsByNumber.values());
    console.log(`Deduplicated to ${safeLoads.length} unique loads`);

    // Archive existing active aljex_flat loads (not booked)
    const { data: archivedData } = await supabase
      .from("loads")
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq("agency_id", AGENCY_ID)
      .eq("template_type", TEMPLATE_TYPE)
      .eq("is_active", true)
      .is("booked_at", null)
      .select("id");

    const archivedCount = archivedData?.length || 0;
    console.log(`Archived ${archivedCount} existing Aljex loads`);

    // Upsert new loads
    const today = new Date().toISOString().split("T")[0];
    const loadsWithBoardDate = safeLoads.map(load => ({
      ...load,
      is_active: true,
      board_date: today,
      archived_at: null,
    }));

    const { error: upsertError } = await supabase
      .from("loads")
      .upsert(loadsWithBoardDate, {
        onConflict: "agency_id,template_type,load_number",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Successfully upserted ${safeLoads.length} Aljex loads`);

    return new Response(JSON.stringify({
      success: true,
      imported: safeLoads.length,
      archived: archivedCount,
      source: "aljex-sync",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-aljex-loads error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
