import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== KEYWORD ANALYTICS ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body));

    const { action, agency_id, load_id, lead_id, keyword_id, source, matched_text } = body;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Action: log_match - Log a keyword match event
    if (action === "log_match") {
      if (!keyword_id || !agency_id || !source) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: keyword_id, agency_id, source" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get keyword to find agent_id
      const { data: keyword } = await supabase
        .from("high_intent_keywords")
        .select("agent_id")
        .eq("id", keyword_id)
        .single();

      const { data, error } = await supabase
        .from("keyword_match_events")
        .insert({
          keyword_id,
          lead_id: lead_id || null,
          agency_id,
          agent_id: keyword?.agent_id || null,
          source,
          matched_text: matched_text || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Error logging match:", error);
        return new Response(
          JSON.stringify({ error: "Failed to log match", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Match logged:", data.id);
      return new Response(JSON.stringify({ success: true, match_id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: attribute_booking - Mark match events as booked when a lead is booked
    if (action === "attribute_booking") {
      if (!lead_id) {
        return new Response(
          JSON.stringify({ error: "Missing lead_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find match events for this lead within last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: matchEvents, error: matchError } = await supabase
        .from("keyword_match_events")
        .select("id")
        .eq("lead_id", lead_id)
        .gte("created_at", sevenDaysAgo)
        .is("booked_at", null);

      if (matchError) {
        console.error("Error finding matches:", matchError);
        return new Response(
          JSON.stringify({ error: "Failed to find matches" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!matchEvents || matchEvents.length === 0) {
        console.log("No match events to attribute for lead:", lead_id);
        return new Response(JSON.stringify({ success: true, attributed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update all matching events with booked_at timestamp
      const matchIds = matchEvents.map(m => m.id);
      const { error: updateError } = await supabase
        .from("keyword_match_events")
        .update({ booked_at: new Date().toISOString() })
        .in("id", matchIds);

      if (updateError) {
        console.error("Error attributing booking:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to attribute booking" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Attributed ${matchIds.length} match events for lead ${lead_id}`);
      return new Response(JSON.stringify({ success: true, attributed: matchIds.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: generate_suggestions - Generate keyword suggestions from a booked load
    if (action === "generate_suggestions") {
      if (!load_id || !agency_id) {
        return new Response(
          JSON.stringify({ error: "Missing load_id or agency_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get load details
      const { data: load, error: loadError } = await supabase
        .from("loads")
        .select("load_number, pickup_city, pickup_state, dest_city, dest_state, commodity")
        .eq("id", load_id)
        .single();

      if (loadError || !load) {
        console.error("Error fetching load:", loadError);
        return new Response(
          JSON.stringify({ error: "Load not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const suggestions: Array<{ keyword: string; keyword_type: string }> = [];

      // Load number
      if (load.load_number) {
        suggestions.push({ keyword: load.load_number, keyword_type: "load" });
      }

      // Pickup city/state
      if (load.pickup_city) {
        suggestions.push({ 
          keyword: load.pickup_state 
            ? `${load.pickup_city}, ${load.pickup_state}` 
            : load.pickup_city, 
          keyword_type: "city" 
        });
      }

      // Destination city/state
      if (load.dest_city) {
        suggestions.push({ 
          keyword: load.dest_state 
            ? `${load.dest_city}, ${load.dest_state}` 
            : load.dest_city, 
          keyword_type: "city" 
        });
      }

      // Lane string (if both cities present)
      if (load.pickup_city && load.dest_city) {
        const laneString = `${load.pickup_city} → ${load.dest_city}`;
        suggestions.push({ keyword: laneString, keyword_type: "lane" });
      }

      // Commodity
      if (load.commodity && load.commodity.trim()) {
        suggestions.push({ keyword: load.commodity.trim(), keyword_type: "commodity" });
      }

      // Check for existing suggestions to avoid duplicates
      const { data: existingSuggestions } = await supabase
        .from("keyword_suggestions")
        .select("keyword")
        .eq("agency_id", agency_id)
        .eq("status", "pending");

      const existingKeywords = new Set((existingSuggestions || []).map(s => s.keyword.toLowerCase()));

      // Also check existing keywords
      const { data: existingKeywordsData } = await supabase
        .from("high_intent_keywords")
        .select("keyword")
        .eq("agency_id", agency_id)
        .gt("expires_at", new Date().toISOString());

      const activeKeywords = new Set((existingKeywordsData || []).map(k => k.keyword.toLowerCase()));

      // Filter out duplicates
      const newSuggestions = suggestions.filter(s => 
        !existingKeywords.has(s.keyword.toLowerCase()) && 
        !activeKeywords.has(s.keyword.toLowerCase())
      );

      if (newSuggestions.length === 0) {
        console.log("No new suggestions to add for load:", load_id);
        return new Response(JSON.stringify({ success: true, added: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert suggestions
      const { data: inserted, error: insertError } = await supabase
        .from("keyword_suggestions")
        .insert(
          newSuggestions.map(s => ({
            agency_id,
            load_id,
            keyword: s.keyword,
            keyword_type: s.keyword_type,
            suggested_scope: "global", // Default to global for booked loads
            status: "pending",
          }))
        )
        .select();

      if (insertError) {
        console.error("Error inserting suggestions:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to insert suggestions" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Added ${inserted?.length || 0} suggestions for load ${load_id}`);
      return new Response(JSON.stringify({ success: true, added: inserted?.length || 0, suggestions: newSuggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: log_match, attribute_booking, generate_suggestions" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
