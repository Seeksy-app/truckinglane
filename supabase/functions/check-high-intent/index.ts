import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== CHECK HIGH INTENT START ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (parseErr) {
      console.log("No JSON body or parse error, using defaults");
    }
    
    console.log("Request body:", JSON.stringify(body));

    const { load_number, origin_city, destination_city, keyword, agent_id } = body || {};

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error("Missing env vars");
      // Return a valid response even on config error - don't block calls
      return new Response(
        JSON.stringify({ 
          is_high_intent: false, 
          instructions: "Proceed with standard load lookup and rate discussion." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Build search conditions
    let isHighIntent = false;
    let matchedKeyword = null;
    let matchedScope: "agent" | "global" | null = null;
    let premiumResponse = null;

    // Get all active keywords - both global and agent-specific
    // Set a short timeout to not block calls
    const queryPromise = supabase
      .from("high_intent_keywords")
      .select(`
        id,
        keyword,
        keyword_type,
        scope,
        agent_id,
        premium_response,
        loads (
          load_number,
          pickup_city,
          dest_city
        )
      `)
      .eq("active", true)
      .gt("expires_at", new Date().toISOString());

    // Race against a timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Query timeout")), 3000)
    );

    let keywords: any[] = [];
    try {
      const result = await Promise.race([queryPromise, timeoutPromise]) as any;
      if (result.error) {
        console.error("Query error:", result.error);
      } else {
        keywords = result.data || [];
      }
    } catch (timeoutErr) {
      console.error("Query timed out, returning default response");
      return new Response(
        JSON.stringify({ 
          is_high_intent: false, 
          instructions: "Proceed with standard load lookup and rate discussion." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter keywords based on scope and agent_id
    const relevantKeywords = keywords.filter(k => {
      if (k.scope === "global") return true;
      if (k.scope === "agent" && agent_id && k.agent_id === agent_id) return true;
      return false;
    });

    // Check for matches (prioritize agent keywords over global)
    const sortedKeywords = [...relevantKeywords].sort((a, b) => {
      // Agent keywords first
      if (a.scope === "agent" && b.scope === "global") return -1;
      if (a.scope === "global" && b.scope === "agent") return 1;
      return 0;
    });

    for (const k of sortedKeywords) {
      // Get load data (handle array or single object)
      const load = Array.isArray(k.loads) ? k.loads[0] : k.loads;
      
      // Normalize for comparison
      const normalizedKeyword = k.keyword.toLowerCase().replace(/[-\s]/g, "");
      
      // Check load number match
      if (load_number) {
        const normalizedLoad = String(load_number).replace(/[-\s]/g, "").toLowerCase();
        if (normalizedKeyword.includes(normalizedLoad) || normalizedLoad.includes(normalizedKeyword)) {
          isHighIntent = true;
          matchedKeyword = k.keyword;
          matchedScope = k.scope;
          premiumResponse = k.premium_response;
          break;
        }
        // Also check associated load
        if (load?.load_number) {
          const loadNum = String(load.load_number).replace(/[-\s]/g, "").toLowerCase();
          if (loadNum.includes(normalizedLoad) || normalizedLoad.includes(loadNum)) {
            isHighIntent = true;
            matchedKeyword = k.keyword;
            matchedScope = k.scope;
            premiumResponse = k.premium_response;
            break;
          }
        }
      }

      // Check origin/destination city match
      if (origin_city || destination_city) {
        const originLower = (origin_city || "").toLowerCase();
        const destLower = (destination_city || "").toLowerCase();
        
        if (load) {
          const pickupCity = (load.pickup_city || "").toLowerCase();
          const destCity = (load.dest_city || "").toLowerCase();
          
          // Check if both cities match (lane match)
          if (originLower && destLower) {
            if (pickupCity.includes(originLower) && destCity.includes(destLower)) {
              isHighIntent = true;
              matchedKeyword = k.keyword;
              matchedScope = k.scope;
              premiumResponse = k.premium_response;
              break;
            }
          }
          // Check single city match
          else if (originLower && pickupCity.includes(originLower)) {
            isHighIntent = true;
            matchedKeyword = k.keyword;
            matchedScope = k.scope;
            premiumResponse = k.premium_response;
            break;
          }
          else if (destLower && destCity.includes(destLower)) {
            isHighIntent = true;
            matchedKeyword = k.keyword;
            matchedScope = k.scope;
            premiumResponse = k.premium_response;
            break;
          }
        }
      }

      // Check custom keyword match
      if (keyword) {
        const keywordLower = String(keyword).toLowerCase();
        if (normalizedKeyword.includes(keywordLower) || keywordLower.includes(normalizedKeyword)) {
          isHighIntent = true;
          matchedKeyword = k.keyword;
          matchedScope = k.scope;
          premiumResponse = k.premium_response;
          break;
        }
      }
    }

    console.log(`High intent check: ${isHighIntent}, matched: ${matchedKeyword}, scope: ${matchedScope}`);

    const response = {
      is_high_intent: isHighIntent,
      matched_keyword: matchedKeyword,
      matched_scope: matchedScope,
      premium_response: premiumResponse || "Congratulations! This is a premium load. Please provide your company name and phone number, and one of our dispatchers will call you right back.",
      instructions: isHighIntent 
        ? "This is a HIGH PRIORITY caller. Immediately use the premium_response and collect their company name and callback number. Do not continue with normal rate negotiation."
        : "This is a normal call. Proceed with standard load lookup and rate discussion."
    };

    console.log("=== CHECK HIGH INTENT END ===");
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    // Always return a valid response - don't break calls
    return new Response(
      JSON.stringify({ 
        is_high_intent: false, 
        instructions: "Proceed with standard load lookup and rate discussion." 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
