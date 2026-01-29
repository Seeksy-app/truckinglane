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

// ============= VMS EMAIL BODY PARSER =============
function parseVMSEmailBody(body: string, agencyId: string): Record<string, unknown>[] {
  const loads: Record<string, unknown>[] = [];
  const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let loadIndex = 1;
  
  for (let line of lines) {
    // Strip Gmail bold formatting (asterisks around text like *2 - City, ST*) 
    line = line.replace(/^\*+/, '').replace(/\*+$/, '').trim();
    
    // Match pattern: "2 - Charleston, SC - cars - Jackson, Tn $1700"
    // Also handles "$1400" without space before "$" and notes after rate
    // Format: COUNT - PICKUP_CITY, ST - COMMODITY - DEST_CITY, ST $RATE [- NOTES]
    const match = line.match(/^(\d+)\s*-\s*([^,]+),\s*([A-Za-z]{2})\s*-\s*([^-]+)\s*-\s*([^,$]+),\s*([A-Za-z]{2})\s*\$?([\d,]+)/i);
    
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
    
    // Create 'count' number of individual load records
    for (let i = 0; i < count; i++) {
      const loadNumber = `VMS-${String(loadIndex).padStart(4, '0')}-${pickupState}-${destState}`;
      loadIndex++;
      
      const baseLoad: Record<string, unknown> = {
        agency_id: agencyId,
        template_type: "vms_email",
        load_number: loadNumber,
        pickup_city: pickupCity,
        pickup_state: pickupState,
        pickup_location_raw: `${pickupCity}, ${pickupState}`,
        dest_city: destCity,
        dest_state: destState,
        dest_location_raw: `${destCity}, ${destState}`,
        ship_date: new Date().toISOString().split('T')[0],
        delivery_date: null,
        trailer_footage: null,
        weight_lbs: weightLbs,
        tarp_required: false,
        ...rateFields,
        commodity: commodity,
        miles: null,
        status: "open",
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
    
    // Log ALL keys to understand what Resend is sending
    console.log("Payload keys:", Object.keys(payload));
    console.log("Payload.data keys:", payload.data ? Object.keys(payload.data) : "no data");
    console.log("Full payload:", JSON.stringify(payload, null, 2));
    
    // Resend inbound webhooks use different field names
    // See: https://resend.com/docs/dashboard/webhooks/event-types#email-received
    const senderEmail = payload.from || payload.sender || payload.email?.from || 
      (typeof payload.data?.from === 'string' ? payload.data.from : payload.data?.from?.email);
    const subject = payload.subject || payload.data?.subject || payload.email?.subject;
    const attachments = payload.attachments || payload.data?.attachments || payload.email?.attachments || [];
    const emailHeaders = payload.headers || payload.data?.headers || {};
    
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
    
    // Determine import type from subject line
    const subjectLower = (subject || "").toLowerCase();
    const containsAdelphia = subjectLower.includes("adelphia");
    // Support both "VMS" and "MVS" (common typo)
    const containsVMS = subjectLower.includes("vms") || subjectLower.includes("mvs");
    
    // Determine import type from subject line first
    if (!containsAdelphia && !containsVMS) {
      console.error("Subject line does not match any known import type:", subject);
      
      // Log the failed attempt
      await supabase.from("email_import_logs").insert({
        sender_email: senderEmail,
        subject: subject,
        status: "rejected",
        error_message: `Subject must contain "adelphia", "VMS", or "MVS"`,
        raw_headers: emailHeaders,
      });
      
      return new Response(JSON.stringify({ 
        error: `Subject must contain "adelphia", "VMS", or "MVS"` 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const importType = containsVMS ? "vms" : "adelphia";
    console.log(`Subject line matches - processing ${importType.toUpperCase()} import`);
    
    // For VMS imports, we need to fetch the email body from Resend API
    // Resend inbound webhooks don't include body - must use resend.emails.receiving.get()
    let emailBody = "";
    const emailId = payload.data?.email_id || payload.email_id;
    
    if (containsVMS && emailId && resendApiKey) {
      console.log("Fetching email content from Resend receiving API for email_id:", emailId);
      try {
        // Use the receiving API to get inbound email content
        const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
          },
        });
        
        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          console.log("Resend receiving API response keys:", Object.keys(emailData));
          emailBody = emailData.text || emailData.html || "";
          console.log("Fetched email body length:", emailBody.length);
          console.log("Email body preview:", emailBody.substring(0, 200));
        } else {
          const errorText = await emailResponse.text();
          console.error("Failed to fetch email from Resend receiving API:", emailResponse.status, errorText);
        }
      } catch (e) {
        console.error("Error fetching email from Resend receiving API:", e);
      }
    }
    
    // Look up agency based on import type
    let agencyQuery;
    if (importType === "vms") {
      agencyQuery = supabase
        .from("agencies")
        .select("id, name, allowed_sender_domains")
        .or("name.ilike.%dl transport%,import_email_code.eq.VMS")
        .limit(1)
        .single();
    } else {
      agencyQuery = supabase
        .from("agencies")
        .select("id, name, allowed_sender_domains")
        .or("name.ilike.%adelphia%,import_email_code.eq.ADELPHIA")
        .limit(1)
        .single();
    }
    
    const { data: agency, error: agencyError } = await agencyQuery;
    
    if (agencyError || !agency) {
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
      
      // Archive existing active, non-booked, non-claimed VMS loads
      const { data: archivedData } = await supabase
        .from("loads")
        .update({
          is_active: false,
          archived_at: new Date().toISOString(),
        })
        .eq("agency_id", agency.id)
        .eq("template_type", "vms_email")
        .eq("is_active", true)
        .is("booked_at", null)
        .is("claimed_by", null)
        .select("id");
      
      const archivedCount = archivedData?.length || 0;
      console.log(`Archived ${archivedCount} existing VMS loads`);
      
      // Get protected load numbers
      const { data: protectedLoads } = await supabase
        .from("loads")
        .select("load_number")
        .eq("agency_id", agency.id)
        .eq("template_type", "vms_email")
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
      
      console.log(`Imported ${importedCount} VMS loads`);
      
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
          subject: `VMS Import Successful - ${importedCount} Loads`,
          html: `
            <h2>VMS Load Import Complete</h2>
            <p>Your email has been successfully imported for <strong>${agency.name}</strong>.</p>
            <ul>
              <li><strong>Loads imported:</strong> ${importedCount}</li>
              <li><strong>Loads archived:</strong> ${archivedCount}</li>
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
        import_type: "vms_email",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // ============= ADELPHIA XLSX IMPORT =============
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
