import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch aggregate stats using service role (bypasses RLS)
    const { count: aiCalls } = await supabase
      .from("ai_call_summaries")
      .select("*", { count: "exact", head: true });

    const { data: minutesData } = await supabase
      .from("ai_call_summaries")
      .select("duration_secs");
    
    const totalMinutes = Math.round(
      (minutesData?.reduce((acc, call) => acc + (call.duration_secs || 0), 0) || 0) / 60
    );

    const { count: leadsCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true });

    return new Response(
      JSON.stringify({
        ai_calls: aiCalls || 0,
        ai_minutes: totalMinutes,
        leads: leadsCount || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching public stats:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
