import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== LOOKUP LOAD ===");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body));

    const { load_number, origin_city, destination_city } = body;

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

    // Helper to extract just the city name (before comma or state)
    const extractCity = (input: string): string => {
      if (!input) return "";
      // Remove commas and anything after, trim whitespace
      const city = input.split(",")[0].trim();
      return city;
    };

    // Helper to normalize load number (remove dashes, spaces)
    const normalizeLoadNumber = (input: string): string => {
      if (!input) return "";
      return input.replace(/[-\s]/g, "");
    };

    // Build query for active loads
    let query = supabase
      .from("loads")
      .select(`
        load_number,
        pickup_city,
        pickup_state,
        dest_city,
        dest_state,
        ship_date,
        customer_invoice_total,
        target_pay,
        max_pay,
        trailer_type,
        weight_lbs,
        miles,
        commodity,
        status
      `)
      .eq("is_active", true)
      .eq("status", "open");

    // Search by load number (normalize to remove dashes)
    if (load_number) {
      const normalizedLoad = normalizeLoadNumber(load_number);
      console.log("Searching by load_number:", load_number, "-> normalized:", normalizedLoad);
      query = query.ilike("load_number", `%${normalizedLoad}%`);
    }

    // Search by origin city (extract just city name)
    if (origin_city) {
      const city = extractCity(origin_city);
      console.log("Searching by origin_city:", origin_city, "-> extracted:", city);
      query = query.ilike("pickup_city", `%${city}%`);
    }

    // Search by destination city (extract just city name)
    if (destination_city) {
      const city = extractCity(destination_city);
      console.log("Searching by destination_city:", destination_city, "-> extracted:", city);
      query = query.ilike("dest_city", `%${city}%`);
    }

    // Limit results
    query = query.limit(5);

    const { data: loads, error } = await query;

    if (error) {
      console.error("Query error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to query loads", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${loads?.length || 0} loads`);

    if (!loads || loads.length === 0) {
      return new Response(
        JSON.stringify({
          found: false,
          message: "No matching loads found. Please try a different load number or lane.",
          loads: []
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format loads for the AI agent with rate info
    const formattedLoads = loads.map((load) => {
      const hasRate = load.target_pay && load.target_pay > 0;
      return {
        load_number: load.load_number,
        lane: `${load.pickup_city}, ${load.pickup_state} → ${load.dest_city}, ${load.dest_state}`,
        pickup: `${load.pickup_city}, ${load.pickup_state}`,
        delivery: `${load.dest_city}, ${load.dest_state}`,
        ship_date: load.ship_date,
        invoice: load.customer_invoice_total,
        target_rate: hasRate ? load.target_pay : null, // 20% margin - quote this first
        max_rate: hasRate ? load.max_pay : null, // 15% margin - max we can go
        rate_available: hasRate,
        trailer_type: load.trailer_type,
        weight: load.weight_lbs,
        miles: load.miles,
        commodity: load.commodity,
      };
    });

    const response = {
      found: true,
      count: formattedLoads.length,
      loads: formattedLoads,
      instructions: `
## Rate Quoting
- Quote the target_rate first (20% margin). Only go up to max_rate (15% margin) if the driver negotiates.
- IMPORTANT: If rate_available is false or target_rate is null/zero, say "I will have to connect you with an agent on the rate" - do NOT make up a rate.

## Carrier Information Collection (ALWAYS DO THIS)
- Always ask for the caller's MC number or DOT number. Say: "May I have your MC or DOT number?"
- Always ask for the company name. Say: "And what is your company name?"
- These are not required - if the caller does not provide them, continue the conversation.
- Do not repeatedly ask if they decline to provide.

## Collecting Contact Information
- When collecting name and phone number, ask for each SEPARATELY.
- After asking for name, PAUSE and wait for a complete response before speaking again.
- After asking for phone number, PAUSE and wait for a complete response before speaking again.
- Confirm the number by repeating it back.
- Do NOT interrupt the caller.

## Ending the Call (CRITICAL)
- Before ending ANY call, you MUST ask: "Is there anything else I can help you with today?"
- Wait for the caller to respond.
- If they say "no", "that's it", "I'm good", or give no response after 3 seconds, immediately say: "Thank you for calling. Have a great day!" and end the call.
- Do NOT continue selling or explaining after the caller indicates they are done.
`
    };

    console.log("Returning:", JSON.stringify(response));

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
