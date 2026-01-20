import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== CREATE LEAD ===");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body));

    // Map ElevenLabs properties to our fields
    const {
      contact_number,    // ElevenLabs: callback phone
      caller_phone,      // Fallback
      caller_name,       // Driver name
      caller_company,    // Company name
      mc_number,         // MC number (optional)
      load_id,           // Load they're interested in
      load_number,       // Alternative: load number
      rate_offered,      // Rate they agreed to
      receiver_phone,    // Agency's phone number (to identify agency)
      agent_phone        // Alternative name for receiver_phone
    } = body;

    // Use contact_number or caller_phone (reject "None" strings)
    let phone = contact_number || caller_phone;
    if (phone && (phone.toLowerCase() === "none" || phone.toLowerCase() === "null" || phone.trim() === "")) {
      phone = null;
    }

    // Validate required field
    if (!phone) {
      console.error("Missing or invalid contact_number/caller_phone:", contact_number);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Valid phone number is required",
          message: "I need your callback number before I can save your information. What's the best number to reach you?",
          instructions: "Ask the caller for their phone number before calling this tool again."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error("Missing env vars");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Look up agency by receiver phone number (the agency's phone line)
    let agencyId: string | null = null;
    const agentNumber = receiver_phone || agent_phone;
    
    if (agentNumber && agentNumber.length > 5) {
      // Normalize and create phone variants
      const normalized = agentNumber.replace(/\D/g, "");
      const phoneVariants = [
        agentNumber,
        `+${normalized}`,
        `+1${normalized.slice(-10)}`,
        normalized,
        normalized.slice(-10),
      ];
      
      console.log("Looking up agency by phone variants:", phoneVariants);
      
      const { data: phoneMatch } = await supabase
        .from("agency_phone_numbers")
        .select("agency_id")
        .in("phone_number", phoneVariants)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      
      if (phoneMatch) {
        agencyId = phoneMatch.agency_id;
        console.log("Matched agency by phone:", agencyId);
      }
    }
    
    // Fallback: get the first agency if no phone match
    if (!agencyId) {
      console.log("No phone match, falling back to first agency");
      const { data: fallbackAgency } = await supabase
        .from("agencies")
        .select("id")
        .limit(1)
        .maybeSingle();
      agencyId = fallbackAgency?.id || null;
    }

    if (!agencyId) {
      console.error("No agency found");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Could not find agency",
          message: "Unable to process the lead at this time."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Using agency:", agencyId);

    // Look up load if load_id or load_number provided
    let loadId = null;
    const loadSearch = load_id || load_number;
    if (loadSearch) {
      const normalizedLoad = loadSearch.replace(/[-\s]/g, "");
      const { data: load } = await supabase
        .from("loads")
        .select("id")
        .ilike("load_number", `%${normalizedLoad}%`)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      
      if (load) {
        loadId = load.id;
        console.log("Matched load:", loadId);
      }
    }

    // Build notes with rate and MC number
    const noteParts = [];
    if (rate_offered) noteParts.push(`Rate offered: ${rate_offered}`);
    if (mc_number) noteParts.push(`MC#: ${mc_number}`);
    const notes = noteParts.length > 0 ? noteParts.join(" | ") : null;

    // Format phone number (ensure it starts with +1 if US number)
    let formattedPhone = phone.replace(/\D/g, "");
    if (formattedPhone.length === 10) {
      formattedPhone = "+1" + formattedPhone;
    } else if (!formattedPhone.startsWith("+")) {
      formattedPhone = "+" + formattedPhone;
    }

    // Check if a pending lead exists with this phone in the last 24 hours
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("caller_phone", formattedPhone)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    let lead;
    if (existingLead) {
      // Update existing lead with new info
      console.log("Updating existing lead:", existingLead.id);
      const { data: updatedLead, error: updateError } = await supabase
        .from("leads")
        .update({
          caller_name: caller_name || null,
          caller_company: caller_company || null,
          load_id: loadId || undefined,
          notes: notes || undefined,
          is_high_intent: true,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingLead.id)
        .select()
        .single();

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }
      lead = updatedLead;
    } else {
      // Create new lead
      console.log("Creating new lead");
      const { data: newLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          agency_id: agencyId,
          caller_phone: formattedPhone,
          caller_name: caller_name || null,
          caller_company: caller_company || null,
          load_id: loadId,
          notes: notes,
          is_high_intent: true,
          status: "pending"
        })
        .select()
        .single();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
      lead = newLead;
    }

    console.log("Lead saved:", lead.id);

    const response = {
      success: true,
      lead_id: lead.id,
      message: `Great! I've saved your information. A dispatcher will call you back shortly at ${formattedPhone}.`,
      instructions: "Confirm to the driver that their information has been saved and a dispatcher will call them back soon."
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: "Internal server error", 
        details: String(err),
        message: "I apologize, but I couldn't save your information. Please try calling back."
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
