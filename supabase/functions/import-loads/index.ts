import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============= CSV PARSING =============

// Convert column index to Excel-style column letter (0 = A, 25 = Z, 26 = AA, etc.)
function indexToColumnLetter(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
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
      // Store by header name (last value wins for duplicates)
      row[header] = value;
      // Also store by column letter (like Excel) for accessing specific columns
      const colLetter = indexToColumnLetter(idx);
      row[`_col_${colLetter}`] = value;
    });
    rows.push(row);
  }
  
  return rows;
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

// ============= XLSX PARSING =============
function parseXLSX(buffer: ArrayBuffer, sheetName: string, headerRow: number): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  
  // Find the sheet
  const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    console.error("Sheet not found:", sheetName, "Available:", workbook.SheetNames);
    return [];
  }
  
  // Get range
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  
  // Read headers from specified row (1-indexed to 0-indexed)
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRow - 1, c: col });
    const cell = sheet[cellAddress];
    headers.push(cell ? String(cell.v).trim() : `Column${col}`);
  }
  
  console.log("Headers found:", headers);
  
  // Read data rows starting after header
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
      
      // Also store by column letter for Adelphia mapping
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
  
  // Try parsing common date formats
  const parts = str.split(/[/-]/);
  if (parts.length === 3) {
    const [m, d, y] = parts;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  
  // Try parsing Excel serial date
  const serial = parseFloat(str);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  
  return null;
}

function parseTarpRequired(value: string | undefined | null): boolean {
  if (!value) return false;
  const upper = String(value).toUpperCase().trim();
  return ["Y", "YES", "TRUE", "1"].includes(upper);
}

function calculateRateFields(rateRaw: number | null, weightLbs: number | null, isPerTon: boolean) {
  // Handle null/missing rate - load should still import
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
  
  // For per-ton rates: only calculate invoice if we have weight
  // If no weight, invoice remains 0 (will display as TBD in UI)
  let invoiceTotal = 0;
  if (isPerTon) {
    if (weightTons > 0) {
      invoiceTotal = Math.round(rate * weightTons);
    }
    // If no weight, leave invoiceTotal as 0 - UI will show "TBD"
  } else {
    invoiceTotal = Math.round(rate);
  }
  
  // Calculate pay and commissions
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

// ============= TEMPLATE MAPPERS =============

// Aljex Flat CSV mapping
function mapAljexFlatRow(row: Record<string, string>, agencyId: string): Record<string, unknown> {
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
  
  // Use Code column KE (index 290): T = Per Ton, F = Flat Rate
  // Access by column letter since there are multiple "Code" columns
  const codeValue = (row["_col_KE"] || row["Code"] || "").toUpperCase().trim();
  const isPerTon = codeValue === "T";
  
  console.log(`Load ${loadNumber}: Code column value = "${codeValue}", isPerTon = ${isPerTon}`);
  
  const rateFields = calculateRateFields(rateNumeric, weightLbs, isPerTon);
  
  // Build notes from various fields
  const notesParts: string[] = [];
  if (row["Description"]) notesParts.push(row["Description"]);
  if (row["Tarp Size"]) notesParts.push(`Tarp Size: ${row["Tarp Size"]}`);
  if (row["Miles/Units/Code/Class"] || row["Miles/Class"]) {
    notesParts.push(`Miles/Class: ${row["Miles/Units/Code/Class"] || row["Miles/Class"]}`);
  }
  if (row["Dispatch Status"]) notesParts.push(`Dispatch: ${row["Dispatch Status"]}`);
  if (row["Type of Shipment"]) notesParts.push(`Type: ${row["Type of Shipment"]}`);
  
  const baseLoad: Record<string, unknown> = {
    agency_id: agencyId,
    template_type: "aljex_flat",
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
    dispatch_status: row["Dispatch Status"] || null,
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
  
  // Generate call script
  baseLoad.load_call_script = generateLoadCallScript(baseLoad);
  
  return baseLoad;
}

// Adelphia XLSX mapping
function mapAdelphiaRow(row: Record<string, string>, agencyId: string, rowIndex: number): Record<string, unknown> {
  // Adelphia column mapping based on actual file structure:
  // Column A: Pickup location (SAVAGE,MN)
  // Column B: (empty)
  // Column C: Rate ($800.00)
  // Column D: Destination (IROQUOIS,SD)
  // Column E: (empty)
  // Column F: Notes (2 lds, no conestoga-flat only, etc.)
  // Column G: Initials (SC, MM, DE, etc.)
  // Column H: Date (17-Dec)
  // Column I: Weight (48061)
  // Column J: Length (20' or blank) - blank = COILS, has value = rebar
  // Column K: Tarp (NO/YES)
  
  const pickupLocationRaw = row["_col_A"] || row["PICK UP AT"] || "";
  const rateRawStr = row["_col_C"] || row["RATE"] || "";
  const destLocationRaw = row["_col_D"] || row["DESTINATION"] || "";
  const notes = row["_col_F"] || "";
  const initials = row["_col_G"] || "";
  const deliveryDateStr = row["_col_H"] || row["READY"] || "";
  const weightStr = row["_col_I"] || row["WEIGHT"] || "";
  const lengthStr = row["_col_J"] || row["LENGTH"] || "";
  const tarpStr = row["_col_K"] || row["TARP"] || "";
  
  // Parse length - extract numeric value from strings like "40'" or "20'"
  let trailerFootage: number | null = null;
  const lengthTrimmed = lengthStr.trim();
  if (lengthTrimmed) {
    // Remove quotes, apostrophes, "ft", etc. and extract number
    const lengthMatch = lengthTrimmed.match(/(\d+)/);
    if (lengthMatch) {
      trailerFootage = parseInt(lengthMatch[1], 10);
    }
  }
  
  // Determine commodity based on length column:
  // If length is blank -> COILS
  // If length has a value (e.g., "40'") -> rebar
  const commodity = lengthTrimmed ? "rebar" : "COILS";
  
  // Parse destination - it's just the city/state already
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
  
  // Parse pickup location
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
  
  // Adelphia: All rates are flat (not per-ton) based on actual file
  const isPerTon = false;
  const rateFields = calculateRateFields(rateNumeric, weightLbs, isPerTon);
  
  // Generate a synthetic load number for Adelphia (required by database)
  // Format: ADE-{rowIndex padded}-{pickup abbrev}-{dest abbrev}
  const pickupAbbrev = pickupState || pickupCity.substring(0, 3).toUpperCase();
  const destAbbrev = destState || destCity.substring(0, 3).toUpperCase();
  const loadNumber = `ADE-${String(rowIndex).padStart(4, '0')}-${pickupAbbrev}-${destAbbrev}`;
  
  const baseLoad: Record<string, unknown> = {
    agency_id: agencyId,
    template_type: "adelphia_xlsx",
    load_number: loadNumber,
    pickup_city: pickupCity || null,
    pickup_state: pickupState || null,
    pickup_location_raw: pickupLocationRaw || null,
    dest_city: destCity || null,
    dest_state: destState || null,
    dest_location_raw: destLocationRaw || null,
    ship_date: parseDate(deliveryDateStr),
    delivery_date: parseDate(deliveryDateStr),
    trailer_footage: trailerFootage,
    weight_lbs: weightLbs,
    tarp_required: parseTarpRequired(tarpStr),
    ...rateFields,
    commodity: commodity,
    miles: null,
    status: "open",
    source_row: row,
  };
  
  // Generate call script
  baseLoad.load_call_script = generateLoadCallScript(baseLoad);
  
  return baseLoad;
}

// ============= MAIN HANDLER =============
Deno.serve(async (req) => {
  console.log("=== IMPORT-LOADS FUNCTION CALLED ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight");
    return new Response(null, { headers: corsHeaders });
  }
  
  console.log("Processing POST request...");
  
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Get user's agency
    const { data: userAgencyId } = await supabase
      .rpc("get_user_agency_id", { _user_id: user.id });
    
    if (!userAgencyId) {
      return new Response(JSON.stringify({ error: "User not in an agency" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("Getting formData...");
    const formData = await req.formData();
    console.log("Got formData");
    const file = formData.get("file") as File;
    const templateType = formData.get("template_type") as string || "aljex_flat";
    const impersonatedAgencyId = formData.get("impersonated_agency_id") as string | null;
    const fileName = file?.name || "unknown";
    
    // If impersonating, verify user is a super_admin before allowing
    let agencyId = userAgencyId;
    if (impersonatedAgencyId && impersonatedAgencyId !== userAgencyId) {
      const { data: isSuperAdmin } = await supabase
        .rpc("has_role", { _user_id: user.id, _role: "super_admin" });
      
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Unauthorized: Only super admins can impersonate" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log(`Super admin impersonating agency ${impersonatedAgencyId}`);
      agencyId = impersonatedAgencyId;
    }
    
    console.log("File:", fileName, "Template:", templateType);
    
    if (!file) {
      console.log("ERROR: No file provided");
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log(`Processing ${templateType} import for agency ${agencyId}, file: ${fileName}`);
    
    let mappedLoads: Record<string, unknown>[];
    
    // Parse based on template type
    if (templateType === "aljex_flat") {
      // CSV parsing
      const csvText = await file.text();
      const rows = parseCSV(csvText);
      
      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: "No data rows found in CSV" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log(`Parsed ${rows.length} rows from CSV`);
      mappedLoads = rows.map(row => mapAljexFlatRow(row, agencyId));
      
      // Filter out rows without load_number for Aljex
      mappedLoads = mappedLoads.filter(load => load.load_number);
      
    } else if (templateType === "adelphia_xlsx") {
      // XLSX parsing - header is on row 4 (PICK UP AT | RATE | DESTINATION...)
      const buffer = await file.arrayBuffer();
      const rows = parseXLSX(buffer, "PAGE 1", 4);
      
      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: "No data rows found in XLSX" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log(`Parsed ${rows.length} rows from XLSX`);
      mappedLoads = rows.map((row, index) => mapAdelphiaRow(row, agencyId, index + 1));
      
      // Filter out rows without valid city data (skips note-only rows)
      // A valid load must have BOTH a pickup city AND a destination city
      mappedLoads = mappedLoads.filter(load => {
        const hasPickupCity = load.pickup_city && String(load.pickup_city).trim().length > 0;
        const hasDestCity = load.dest_city && String(load.dest_city).trim().length > 0;
        return hasPickupCity && hasDestCity;
      });
      
    } else {
      return new Response(JSON.stringify({ error: `Unknown template: ${templateType}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log(`${mappedLoads.length} loads after filtering`);
    
    if (mappedLoads.length === 0) {
      return new Response(JSON.stringify({ error: "No valid loads found after parsing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Create import batch record
    const { data: batchData, error: batchError } = await supabase
      .from("load_import_runs")
      .insert({
        agency_id: agencyId,
        template_type: templateType,
        uploaded_by: user.id,
        file_name: fileName,
        row_count: mappedLoads.length,
        replaced_count: 0,
      })
      .select("id")
      .single();
    
    if (batchError) {
      console.error("Batch insert error:", batchError);
    }
    
    // Soft-delete: Archive existing active, non-booked, non-claimed loads for this agency + template
    const { data: archivedData, error: archiveError } = await supabase
      .from("loads")
      .update({
        is_active: false,
        archived_at: new Date().toISOString(),
      })
      .eq("agency_id", agencyId)
      .eq("template_type", templateType)
      .eq("is_active", true)
      .is("booked_at", null) // Don't archive booked loads
      .is("claimed_by", null) // Don't archive claimed loads
      .select("id");
    
    if (archiveError) {
      console.error("Archive error:", archiveError);
      return new Response(JSON.stringify({ error: archiveError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const archivedCount = archivedData?.length || 0;
    console.log(`Archived ${archivedCount} existing ${templateType} loads`);
    
    // Get claimed/booked load_numbers to exclude from upsert (don't overwrite claimed loads)
    const { data: protectedLoads } = await supabase
      .from("loads")
      .select("load_number")
      .eq("agency_id", agencyId)
      .eq("template_type", templateType)
      .eq("is_active", true)
      .or("claimed_by.not.is.null,booked_at.not.is.null");
    
    const protectedLoadNumbers = new Set(
      (protectedLoads || []).map(l => l.load_number)
    );
    console.log(`Protecting ${protectedLoadNumbers.size} claimed/booked loads from overwrite`);
    
    // Filter out loads that would overwrite claimed/booked loads
    const safeLoads = mappedLoads.filter(load => 
      !protectedLoadNumbers.has(load.load_number as string)
    );
    console.log(`${safeLoads.length} loads to upsert after filtering protected`);
    
    // Only upsert if there are safe loads to import
    if (safeLoads.length > 0) {
      // Upsert loads with is_active=true and board_date=today
      // Use upsert to handle duplicate load_number values (updates existing, inserts new)
      const today = new Date().toISOString().split("T")[0];
      const loadsWithBoardDate = safeLoads.map(load => ({
        ...load,
        is_active: true,
        board_date: today,
        archived_at: null, // Re-activate if previously archived
      }));
      
      const { error: insertError } = await supabase
        .from("loads")
        .upsert(loadsWithBoardDate, {
          onConflict: "agency_id,template_type,load_number",
          ignoreDuplicates: false, // Update on conflict
        });
      
      if (insertError) {
        console.error("Upsert error:", insertError);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log(`Upserted ${loadsWithBoardDate.length} loads`);
    }
    
    const importedCount = safeLoads.length;
    const skippedCount = mappedLoads.length - safeLoads.length;
    
    console.log(`Imported ${importedCount} loads, skipped ${skippedCount} protected loads`);
    
    // Update batch with archived count
    if (batchData?.id) {
      await supabase
        .from("load_import_runs")
        .update({ replaced_count: archivedCount })
        .eq("id", batchData.id);
    }
    
    return new Response(JSON.stringify({
      success: true,
      imported: importedCount,
      archived: archivedCount,
      skipped: skippedCount,
      template: templateType,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error: unknown) {
    console.error("Import error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
