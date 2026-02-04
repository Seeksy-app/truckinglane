import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LoadData {
  load_number: string;
  ship_date: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  trailer_type: string | null;
  trailer_footage: number | null;
  weight_lbs: number | null;
  commodity: string | null;
}

function formatLoadPost(load: LoadData): string {
  const lines: string[] = [];
  
  // Header with load number
  lines.push(`🚛 LOAD AVAILABLE #${load.load_number}`);
  lines.push("");
  
  // Route section
  lines.push("📍 ROUTE");
  if (load.ship_date) {
    lines.push(`Ship Date: ${load.ship_date}`);
  }
  if (load.pickup_city && load.pickup_state) {
    lines.push(`Pickup: ${load.pickup_city}, ${load.pickup_state}`);
  }
  if (load.dest_city && load.dest_state) {
    lines.push(`Delivery: ${load.dest_city}, ${load.dest_state}`);
  }
  lines.push("");
  
  // Equipment section
  lines.push("🔧 EQUIPMENT");
  if (load.trailer_type) {
    const footageStr = load.trailer_footage ? ` | ${load.trailer_footage} ft` : "";
    lines.push(`Trailer: ${load.trailer_type}${footageStr}`);
  }
  if (load.weight_lbs) {
    lines.push(`Weight: ${load.weight_lbs.toLocaleString()} lbs`);
  }
  if (load.commodity) {
    lines.push(`Commodity: ${load.commodity}`);
  }
  lines.push("");
  
  // Call to action
  lines.push("📞 Call now for rates: +1 888 785 7499");
  lines.push("#trucking #freightbroker #flatbed #loads #carriers");
  
  return lines.join("\n");
}

serve(async (req) => {
  console.log("=== POST LOAD TO X ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const UPLOAD_POST_API_KEY = Deno.env.get("UPLOAD_POST_API_KEY");
    if (!UPLOAD_POST_API_KEY) {
      console.error("UPLOAD_POST_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Upload Post API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    console.log("Request body:", JSON.stringify(body));
    
    const { loads, load_ids } = body;
    
    // If load_ids provided, fetch from database
    let loadsToPost: LoadData[] = loads || [];
    
    if (load_ids && load_ids.length > 0 && loadsToPost.length === 0) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      if (!SUPABASE_URL || !SERVICE_KEY) {
        throw new Error("Supabase configuration missing");
      }
      
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
      
      const { data: fetchedLoads, error } = await supabase
        .from("loads")
        .select("load_number, ship_date, pickup_city, pickup_state, dest_city, dest_state, trailer_type, trailer_footage, weight_lbs, commodity")
        .in("id", load_ids);
      
      if (error) {
        console.error("Error fetching loads:", error);
        throw new Error(`Failed to fetch loads: ${error.message}`);
      }
      
      loadsToPost = fetchedLoads || [];
    }

    if (loadsToPost.length === 0) {
      return new Response(
        JSON.stringify({ error: "No loads provided to post" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ load_number: string; success: boolean; post_id?: string; error?: string }> = [];

    // Post each load to X via Upload Post
    for (const load of loadsToPost) {
      const postText = formatLoadPost(load);
      console.log(`Posting load ${load.load_number}:`, postText.substring(0, 100) + "...");
      
      try {
        const response = await fetch("https://api.upload-post.com/api/upload_text", {
          method: "POST",
          headers: {
            "Authorization": `Apikey ${UPLOAD_POST_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user: "@TruckingLane",
            platforms: ["x"],
            text: postText,
          }),
        });

        const responseText = await response.text();
        console.log(`Upload Post response for ${load.load_number}:`, responseText);

        if (!response.ok) {
          results.push({
            load_number: load.load_number,
            success: false,
            error: `Upload Post API error: ${response.status} - ${responseText}`,
          });
          continue;
        }

        let result;
        try {
          result = JSON.parse(responseText);
        } catch {
          result = { raw: responseText };
        }

        results.push({
          load_number: load.load_number,
          success: true,
          post_id: result.id || result.post_id || "posted",
        });
        
        // Small delay between posts to avoid rate limiting
        if (loadsToPost.indexOf(load) < loadsToPost.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (postError) {
        console.error(`Error posting load ${load.load_number}:`, postError);
        results.push({
          load_number: load.load_number,
          success: false,
          error: postError instanceof Error ? postError.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Posted ${successCount}/${loadsToPost.length} loads to X`);

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        posted_count: successCount,
        total_count: loadsToPost.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
