import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== GET HIGH INTENT KEYWORDS ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Get all active (non-expired) keywords
    const { data: keywords, error } = await supabase
      .from("high_intent_keywords")
      .select(`
        id,
        keyword,
        keyword_type,
        scope,
        agent_id,
        premium_response,
        load_id,
        loads (
          load_number,
          pickup_city,
          pickup_state,
          dest_city,
          dest_state
        )
      `)
      .eq("active", true)
      .gt("expires_at", new Date().toISOString());

    if (error) {
      console.error("Query error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch keywords" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${keywords?.length || 0} active keywords`);

    // Format for the AI agent
    const formattedKeywords = (keywords || []).map((k: any) => {
      const load = Array.isArray(k.loads) ? k.loads[0] : k.loads;
      return {
        keyword: k.keyword,
        type: k.keyword_type,
        scope: k.scope,
        agent_id: k.agent_id,
        premium_response: k.premium_response,
        load_number: load?.load_number,
        lane: load ? `${load.pickup_city} to ${load.dest_city}` : null,
      };
    });

    const response = {
      keywords: formattedKeywords,
      count: formattedKeywords.length,
      global_count: formattedKeywords.filter((k: any) => k.scope === "global").length,
      agent_count: formattedKeywords.filter((k: any) => k.scope === "agent").length,
      premium_response: "Congratulations! This is a premium load. Please provide your company name and phone number, and one of our dispatchers will call you right back.",
      instructions: "If the caller mentions any of these keywords, load numbers, or lanes, immediately use the premium response and collect their contact info. Agent-specific keywords have higher priority."
    };

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
