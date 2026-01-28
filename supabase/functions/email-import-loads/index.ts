import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    trailer_footage: parseNumber(lengthStr),
    weight_lbs: weightLbs,
    tarp_required: parseTarpRequired(tarpStr),
    ...rateFields,
    commodity: notes || null,
    miles: null,
    status: "open",
    source_row: row,
  };
  
  baseLoad.load_call_script = generateLoadCallScript(baseLoad);
  
  return baseLoad;
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
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const resend = resendApiKey ? new Resend(resendApiKey) : null;
  
  try {
    // Resend inbound email webhook payload
    const payload = await req.json();
    console.log("Received inbound email payload");
    
    const {
      from: senderEmail,
      subject,
      attachments = [],
      headers: emailHeaders,
    } = payload;
    
    console.log("From:", senderEmail);
    console.log("Subject:", subject);
    console.log("Attachments count:", attachments.length);
    
    // Extract sender domain
    const senderDomain = senderEmail?.split("@")[1]?.toLowerCase();
    if (!senderDomain) {
      console.error("Invalid sender email:", senderEmail);
      return new Response(JSON.stringify({ error: "Invalid sender email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Check if subject contains "adelphia" (case-insensitive)
    const subjectLower = (subject || "").toLowerCase();
    const containsAdelphia = subjectLower.includes("adelphia");
    
    if (!containsAdelphia) {
      console.error("Subject line does not contain 'adelphia':", subject);
      
      // Log the failed attempt
      await supabase.from("email_import_logs").insert({
        sender_email: senderEmail,
        subject: subject,
        status: "rejected",
        error_message: `Subject line must contain "adelphia"`,
        raw_headers: emailHeaders,
      });
      
      return new Response(JSON.stringify({ 
        error: `Subject line must contain "adelphia"` 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("Subject line matches - processing Adelphia import");
    
    // Look up Adelphia agency by name (or the first agency with Adelphia imports configured)
    const { data: agency, error: agencyError } = await supabase
      .from("agencies")
      .select("id, name, allowed_sender_domains")
      .or("name.ilike.%adelphia%,import_email_code.eq.ADELPHIA")
      .limit(1)
      .single();
    
    if (agencyError || !agency) {
      console.error("Adelphia agency not found");
      
      await supabase.from("email_import_logs").insert({
        sender_email: senderEmail,
        subject: subject,
        status: "rejected",
        error_message: "Adelphia agency not configured in the system",
        raw_headers: emailHeaders,
      });
      
      return new Response(JSON.stringify({ error: "Adelphia agency not configured" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("Found agency:", agency.name, agency.id);
    
    // Validate sender domain against whitelist
    const allowedDomains = (agency.allowed_sender_domains || []).map((d: string) => d.toLowerCase());
    if (allowedDomains.length > 0 && !allowedDomains.includes(senderDomain)) {
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
    
    // Find XLSX attachment
    const xlsxAttachment = attachments.find((att: { filename: string; content: string }) => 
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
      
      if (resend) {
        await resend.emails.send({
          from: "Trucking Lane <noreply@truckinglane.com>",
          to: [senderEmail],
          subject: "Import Failed - No Attachment",
          html: `
            <p>Your email import for ${agency.name} failed because no XLSX attachment was found.</p>
            <p>Please attach an Adelphia spreadsheet (.xlsx) and resend.</p>
          `,
        }).catch(e => console.error("Failed to send error email:", e));
      }
      
      return new Response(JSON.stringify({ error: "No XLSX attachment found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("Processing attachment:", xlsxAttachment.filename);
    
    // Decode base64 attachment content
    const fileContent = decodeBase64(xlsxAttachment.content);
    const buffer = new Uint8Array(fileContent).buffer as ArrayBuffer;
    
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
      
      if (resend) {
        await resend.emails.send({
          from: "Trucking Lane <noreply@truckinglane.com>",
          to: [senderEmail],
          subject: "Import Failed - Empty Spreadsheet",
          html: `
            <p>Your email import for ${agency.name} failed because no data rows were found in the spreadsheet.</p>
            <p>Please verify the spreadsheet format and resend.</p>
          `,
        }).catch(e => console.error("Failed to send error email:", e));
      }
      
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
    
    // Archive existing active, non-booked, non-claimed Adelphia loads
    const { data: archivedData } = await supabase
      .from("loads")
      .update({
        is_active: false,
        archived_at: new Date().toISOString(),
      })
      .eq("agency_id", agency.id)
      .eq("template_type", "adelphia_xlsx")
      .eq("is_active", true)
      .is("booked_at", null)
      .is("claimed_by", null)
      .select("id");
    
    const archivedCount = archivedData?.length || 0;
    console.log(`Archived ${archivedCount} existing Adelphia loads`);
    
    // Get protected load numbers
    const { data: protectedLoads } = await supabase
      .from("loads")
      .select("load_number")
      .eq("agency_id", agency.id)
      .eq("template_type", "adelphia_xlsx")
      .eq("is_active", true)
      .or("claimed_by.not.is.null,booked_at.not.is.null");
    
    const protectedLoadNumbers = new Set(
      (protectedLoads || []).map(l => l.load_number)
    );
    
    // Filter out protected loads
    const safeLoads = mappedLoads.filter(load => 
      !protectedLoadNumbers.has(load.load_number as string)
    );
    
    let importedCount = 0;
    
    if (safeLoads.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      const loadsWithBoardDate = safeLoads.map(load => ({
        ...load,
        is_active: true,
        board_date: today,
        archived_at: null,
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
    }
    
    console.log(`Imported ${importedCount} loads`);
    
    // Log successful import
    await supabase.from("email_import_logs").insert({
      agency_id: agency.id,
      sender_email: senderEmail,
      subject: subject,
      status: "success",
      imported_count: importedCount,
      raw_headers: emailHeaders,
    });
    
    // Send confirmation email
    if (resend) {
      await resend.emails.send({
        from: "Trucking Lane <noreply@truckinglane.com>",
        to: [senderEmail],
        subject: `Import Successful - ${importedCount} Loads`,
        html: `
          <h2>Adelphia Import Complete</h2>
          <p>Your spreadsheet has been successfully imported for <strong>${agency.name}</strong>.</p>
          <ul>
            <li><strong>Loads imported:</strong> ${importedCount}</li>
            <li><strong>Loads archived:</strong> ${archivedCount}</li>
            <li><strong>File:</strong> ${xlsxAttachment.filename}</li>
          </ul>
          <p>The loads are now available in your dashboard.</p>
        `,
      }).catch(e => console.error("Failed to send confirmation email:", e));
    }
    
    return new Response(JSON.stringify({
      success: true,
      imported: importedCount,
      archived: archivedCount,
      agency: agency.name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error: unknown) {
    console.error("Email import error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
