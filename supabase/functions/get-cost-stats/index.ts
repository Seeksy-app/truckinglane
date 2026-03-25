import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_RATE_PER_MIN = 0.05;
const FIRECRAWL_RATE_PER_CRAWL = 0.005;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;
    const monthAgo = now - 30 * 86400;

    // Fetch ElevenLabs conversations
    let dailyMins = 0, monthlyMins = 0, allTimeMins = 0;
    let elevenLabsOk = false;

    try {
      const elResp = await fetch("https://api.elevenlabs.io/v1/convai/conversations?page_size=200", {
        headers: { "xi-api-key": elevenLabsKey },
      });
      if (elResp.ok) {
        const elData = await elResp.json();
        const conversations = elData.conversations || [];
        elevenLabsOk = true;

        for (const conv of conversations) {
          const secs = conv.call_duration_secs || 0;
          const mins = secs / 60;
          const startTime = conv.start_time_unix_secs || 0;
          allTimeMins += mins;
          if (startTime > monthAgo) monthlyMins += mins;
          if (startTime > dayAgo) dailyMins += mins;
        }
      }
    } catch (e) {
      console.error("ElevenLabs fetch failed:", e);
    }

    // Fallback to phone_calls table if ElevenLabs API fails
    if (!elevenLabsOk) {
      const { data: calls } = await supabase
        .from("phone_calls")
        .select("duration_seconds, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      for (const c of calls || []) {
        const mins = (c.duration_seconds || 0) / 60;
        const t = new Date(c.created_at).getTime() / 1000;
        allTimeMins += mins;
        if (t > monthAgo) monthlyMins += mins;
        if (t > dayAgo) dailyMins += mins;
      }
    }

    // Firecrawl: count discovered accounts
    const { count: crawlCount } = await supabase
      .from("accounts")
      .select("*", { count: "exact", head: true });
    const firecrawlCost = (crawlCount || 0) * FIRECRAWL_RATE_PER_CRAWL;

    const dailyCost = dailyMins * ELEVENLABS_RATE_PER_MIN;
    const monthlyCost = monthlyMins * ELEVENLABS_RATE_PER_MIN + firecrawlCost;
    const allTimeCost = allTimeMins * ELEVENLABS_RATE_PER_MIN + firecrawlCost;

    return new Response(JSON.stringify({
      daily: Math.round(dailyCost * 100) / 100,
      monthly: Math.round(monthlyCost * 100) / 100,
      allTime: Math.round(allTimeCost * 100) / 100,
      breakdown: [
        { name: "ElevenLabs AI", daily: Math.round(dailyMins * ELEVENLABS_RATE_PER_MIN * 100) / 100, monthly: Math.round(monthlyMins * ELEVENLABS_RATE_PER_MIN * 100) / 100 },
        { name: "Firecrawl", daily: 0, monthly: Math.round(firecrawlCost * 100) / 100 },
      ],
      meta: { elevenLabsOk, dailyMins: Math.round(dailyMins), monthlyMins: Math.round(monthlyMins) }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
