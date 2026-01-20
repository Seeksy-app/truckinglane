import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Types for load suggestions
interface LoadSuggestion {
  id: string;
  load_number: string;
  pickup_city: string | null;
  pickup_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  trailer_type: string | null;
  customer_invoice_total: number | null;
  target_pay: number | null;
  confidence: "high" | "medium" | "low";
  match_reason: string;
}

interface LoadRow {
  id: string;
  load_number: string;
  pickup_city: string | null;
  pickup_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  trailer_type: string | null;
  customer_invoice_total: number | null;
  target_pay: number | null;
}

// Extract load numbers from text (transcript/notes)
function extractLoadNumbers(text: string): string[] {
  if (!text) return [];
  // Match patterns like "load 1234567", "load #1234567", "1234567", etc.
  const patterns = [
    /load\s*#?\s*(\d{5,10})/gi,
    /\b(\d{7})\b/g, // 7-digit numbers are common load numbers
  ];
  
  const numbers = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      numbers.add(match[1]);
    }
  }
  return Array.from(numbers);
}

// Extract city names from text
function extractCities(text: string): string[] {
  if (!text) return [];
  // Common trucking cities and patterns
  const cityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*(?:TX|CA|FL|IL|NY|PA|OH|GA|NC|MI|NJ|VA|WA|AZ|MA|TN|IN|MO|MD|WI|CO|MN|SC|AL|LA|KY|OR|OK|CT|UT|IA|NV|AR|MS|KS|NM|NE|WV|ID|HI|NH|ME|MT|RI|DE|SD|ND|AK|VT|WY)\b/g;
  
  const cities: string[] = [];
  let match;
  while ((match = cityPattern.exec(text)) !== null) {
    cities.push(match[1].toLowerCase());
  }
  return cities;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function suggestLoads(
  supabase: any,
  agencyId: string,
  queryText: string,
  pickupCity?: string,
  destCity?: string,
  loadNumberGuess?: string
): Promise<LoadSuggestion[]> {
  const suggestions: LoadSuggestion[] = [];
  const seenIds = new Set<string>();

  console.log("[suggest-loads] Starting search with:", { agencyId, pickupCity, destCity, loadNumberGuess, queryTextLength: queryText?.length });

  // 1. Direct load number match (highest confidence)
  const loadNumbers = loadNumberGuess ? [loadNumberGuess] : extractLoadNumbers(queryText);
  console.log("[suggest-loads] Extracted load numbers:", loadNumbers);
  
  if (loadNumbers.length > 0) {
    const { data: loadMatches, error } = await supabase
      .from("loads")
      .select("id, load_number, pickup_city, pickup_state, dest_city, dest_state, trailer_type, customer_invoice_total, target_pay")
      .eq("agency_id", agencyId)
      .eq("status", "open")
      .eq("is_active", true)
      .in("load_number", loadNumbers)
      .limit(3);

    if (error) console.error("[suggest-loads] Load number query error:", error);
    
    if (loadMatches && Array.isArray(loadMatches)) {
      for (const load of loadMatches as LoadRow[]) {
        if (!seenIds.has(load.id)) {
          seenIds.add(load.id);
          suggestions.push({
            id: load.id,
            load_number: load.load_number,
            pickup_city: load.pickup_city,
            pickup_state: load.pickup_state,
            dest_city: load.dest_city,
            dest_state: load.dest_state,
            trailer_type: load.trailer_type,
            customer_invoice_total: load.customer_invoice_total,
            target_pay: load.target_pay,
            confidence: "high",
            match_reason: `Load # ${load.load_number} mentioned in conversation`,
          });
        }
      }
    }
  }

  // 2. City/route match (medium-high confidence)
  const extractedCities = extractCities(queryText);
  const searchPickupCity = pickupCity?.toLowerCase() || extractedCities[0];
  const searchDestCity = destCity?.toLowerCase() || extractedCities[1];
  
  console.log("[suggest-loads] City search:", { searchPickupCity, searchDestCity });

  if (searchPickupCity || searchDestCity) {
    let query = supabase
      .from("loads")
      .select("id, load_number, pickup_city, pickup_state, dest_city, dest_state, trailer_type, customer_invoice_total, target_pay")
      .eq("agency_id", agencyId)
      .eq("status", "open")
      .eq("is_active", true);

    if (searchPickupCity) {
      query = query.ilike("pickup_city", `%${searchPickupCity}%`);
    }
    if (searchDestCity) {
      query = query.ilike("dest_city", `%${searchDestCity}%`);
    }

    const { data: cityMatches, error } = await query.limit(5);
    
    if (error) console.error("[suggest-loads] City query error:", error);

    if (cityMatches && Array.isArray(cityMatches)) {
      for (const load of cityMatches as LoadRow[]) {
        if (!seenIds.has(load.id) && suggestions.length < 3) {
          seenIds.add(load.id);
          const reasons: string[] = [];
          if (searchPickupCity && load.pickup_city?.toLowerCase().includes(searchPickupCity)) {
            reasons.push(`Pickup: ${load.pickup_city}`);
          }
          if (searchDestCity && load.dest_city?.toLowerCase().includes(searchDestCity)) {
            reasons.push(`Delivery: ${load.dest_city}`);
          }
          suggestions.push({
            id: load.id,
            load_number: load.load_number,
            pickup_city: load.pickup_city,
            pickup_state: load.pickup_state,
            dest_city: load.dest_city,
            dest_state: load.dest_state,
            trailer_type: load.trailer_type,
            customer_invoice_total: load.customer_invoice_total,
            target_pay: load.target_pay,
            confidence: reasons.length === 2 ? "high" : "medium",
            match_reason: reasons.join(" → ") || "Route match",
          });
        }
      }
    }
  }

  // 3. Recent open loads fallback (low confidence)
  if (suggestions.length < 3) {
    const { data: recentLoads, error } = await supabase
      .from("loads")
      .select("id, load_number, pickup_city, pickup_state, dest_city, dest_state, trailer_type, customer_invoice_total, target_pay")
      .eq("agency_id", agencyId)
      .eq("status", "open")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) console.error("[suggest-loads] Recent loads query error:", error);

    if (recentLoads && Array.isArray(recentLoads)) {
      for (const load of recentLoads as LoadRow[]) {
        if (!seenIds.has(load.id) && suggestions.length < 3) {
          seenIds.add(load.id);
          suggestions.push({
            id: load.id,
            load_number: load.load_number,
            pickup_city: load.pickup_city,
            pickup_state: load.pickup_state,
            dest_city: load.dest_city,
            dest_state: load.dest_state,
            trailer_type: load.trailer_type,
            customer_invoice_total: load.customer_invoice_total,
            target_pay: load.target_pay,
            confidence: "low",
            match_reason: "Recent open load",
          });
        }
      }
    }
  }

  console.log("[suggest-loads] Returning", suggestions.length, "suggestions");
  return suggestions.slice(0, 3);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  const url = new URL(req.url);
  if (url.pathname.endsWith("/health") || url.searchParams.get("health") === "true") {
    return new Response(JSON.stringify({ status: "ok", service: "ai-assistant", timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle suggest-loads action (SQL-first, no AI needed)
    if (action === "suggest-loads") {
      const { agencyId, leadId, queryText, pickupCity, destCity, loadNumberGuess } = body;
      
      if (!agencyId) {
        return new Response(JSON.stringify({ error: "agencyId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If leadId provided, fetch the lead's transcript/notes for context
      let fullQueryText = queryText || "";
      if (leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("notes, conversation_id")
          .eq("id", leadId)
          .single();
        
        if (lead?.notes) {
          fullQueryText += " " + lead.notes;
        }
        
        // Also fetch conversation transcript if available
        if (lead?.conversation_id) {
          const { data: conv } = await supabase
            .from("conversations")
            .select("transcript, summary")
            .eq("id", lead.conversation_id)
            .single();
          
          if (conv?.transcript) {
            fullQueryText += " " + conv.transcript;
          }
          if (conv?.summary) {
            fullQueryText += " " + conv.summary;
          }
        }
      }

      const suggestions = await suggestLoads(
        supabase,
        agencyId,
        fullQueryText,
        pickupCity,
        destCity,
        loadNumberGuess
      );

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: Chat completion mode
    const { messages, agencyId } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Fetch context data for the AI
    let contextData = "";
    
    if (agencyId) {
      // Fetch active leads (status=pending in DB, displayed as "Lead" to users)
      const { data: activeLeads } = await supabase
        .from("leads")
        .select("id, caller_phone, caller_name, caller_company, carrier_name, carrier_usdot, carrier_mc, is_high_intent, intent_score, intent_reason_breakdown, created_at, load_id")
        .eq("agency_id", agencyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(30);
      
      // Fetch high-intent leads specifically (for "show me high-intent" queries)
      const { data: highIntentLeads } = await supabase
        .from("leads")
        .select("id, caller_phone, caller_name, caller_company, carrier_name, carrier_usdot, carrier_mc, is_high_intent, intent_score, intent_reason_breakdown, created_at, load_id")
        .eq("agency_id", agencyId)
        .eq("is_high_intent", true)
        .order("created_at", { ascending: false })
        .limit(20);

      // Fetch open loads
      const { data: openLoads } = await supabase
        .from("loads")
        .select("id, load_number, pickup_city, pickup_state, dest_city, dest_state, trailer_type, customer_invoice_total, target_pay, status, load_call_script")
        .eq("agency_id", agencyId)
        .eq("status", "open")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);

      // Fetch recent calls with summaries
      const { data: recentCalls } = await supabase
        .from("phone_calls")
        .select(`
          id, caller_phone, duration_seconds, created_at,
          conversations(summary, intent, sentiment)
        `)
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false })
        .limit(20);

      // Type assertions for the data
      interface LeadData {
        id: string;
        caller_phone: string;
        caller_name: string | null;
        caller_company: string | null;
        carrier_name: string | null;
        carrier_usdot: string | null;
        carrier_mc: string | null;
        is_high_intent: boolean | null;
        intent_score: number | null;
        intent_reason_breakdown: string[] | null;
        created_at: string;
        load_id: string | null;
      }
      
      const leads = (activeLeads as LeadData[]) || [];
      const hiLeads = (highIntentLeads as LeadData[]) || [];
      const loads = openLoads as { load_number: string; pickup_city: string | null; pickup_state: string | null; dest_city: string | null; dest_state: string | null; trailer_type: string | null; customer_invoice_total: number | null; target_pay: number | null }[] || [];
      const calls = recentCalls as { caller_phone: string; duration_seconds: number | null; conversations: { summary: string | null; intent: string | null }[] | null }[] || [];

      // Format lead display
      const formatLead = (l: LeadData) => {
        const parts = [`- ${l.is_high_intent ? "🔥 HIGH INTENT" : ""} Lead from ${l.caller_phone}`];
        if (l.caller_name) parts.push(`(${l.caller_name})`);
        if (l.carrier_name) parts.push(`| Carrier: ${l.carrier_name}`);
        if (l.carrier_usdot) parts.push(`DOT: ${l.carrier_usdot}`);
        if (l.carrier_mc) parts.push(`MC: ${l.carrier_mc}`);
        if (l.intent_score) parts.push(`| Score: ${l.intent_score}%`);
        if (l.intent_reason_breakdown && Array.isArray(l.intent_reason_breakdown)) {
          parts.push(`| Reasons: ${l.intent_reason_breakdown.join(", ")}`);
        }
        parts.push(`| Created: ${new Date(l.created_at).toLocaleString()}`);
        return parts.join(" ");
      };

      contextData = `
## Current Data Context

### High-Intent Leads (${hiLeads.length} total) - PRIORITY CALLBACKS:
${hiLeads.length > 0 ? hiLeads.map(formatLead).join("\n") : "No high-intent leads currently"}

### All Active Leads (${leads.length} total):
${leads.length > 0 ? leads.map(formatLead).join("\n") : "No active leads"}

### Open Loads (${loads.length} total):
${loads.map(l => `- Load #${l.load_number}: ${l.pickup_city}, ${l.pickup_state} → ${l.dest_city}, ${l.dest_state} | ${l.trailer_type || "Unknown"} | Invoice: $${l.customer_invoice_total?.toLocaleString() || "N/A"} | Target Pay: $${l.target_pay?.toLocaleString() || "N/A"}`).join("\n") || "No open loads"}

### Recent Calls (${calls.length} total):
${calls.map(c => {
  const conv = c.conversations?.[0];
  return `- ${c.caller_phone} (${c.duration_seconds ? Math.floor(c.duration_seconds / 60) + "m " + (c.duration_seconds % 60) + "s" : "unknown duration"}) - ${conv?.intent || "unknown intent"}${conv?.summary ? `: ${conv.summary.slice(0, 100)}...` : ""}`;
}).join("\n") || "No recent calls"}
`;
    }

    const systemPrompt = `You are an AI assistant for a trucking freight brokerage dispatch team. You help agents:
1. Find loads by number, location, trailer type, or rate
2. Identify loads mentioned in calls
3. Look up carrier information by DOT or MC number
4. Suggest which leads to call back based on intent
5. Summarize call history and lead status
6. Answer questions about loads and leads

Be concise and professional. When referencing loads, always include the load number.
When suggesting callbacks, prioritize high-intent leads.
Format load searches as bullet points with key details.

IMPORTANT: Always use "Lead" (not "Pending") when referring to unresolved leads. 
For example: "You have 3 active leads to follow up" instead of "3 pending leads".

## CRITICAL: Detecting DOT, MC, and Carrier Names

When a user enters JUST a number (5-8 digits) or a company name without clear context, you MUST ask a clarifying question:

Pattern detection rules:
- 5-8 digit numbers could be DOT numbers, MC numbers, OR load numbers
- Company names like "Swift", "Schneider", "JB Hunt" are likely carrier lookups
- Numbers prefixed with "DOT" or "MC" are carrier lookups
- Numbers prefixed with "Load" or "#" are load lookups

When you detect an ambiguous input (just a number or company name), respond with:
"Are you looking for **[input]** as a carrier (DOT/MC lookup) or is this a load number?"

Examples:
- User: "224063" → "Are you looking for **224063** as a carrier (DOT/MC lookup) or is this a load number?"
- User: "Flints Trucking" → "Are you looking up **Flints Trucking** carrier information?"
- User: "DOT 4038099" → This is clearly a carrier lookup, proceed with carrier info
- User: "Load 224063" → This is clearly a load lookup, proceed with load info
- User: "MC 1527797" → This is clearly a carrier lookup, proceed with carrier info

${contextData}

Current time: ${new Date().toLocaleString()}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("AI assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});