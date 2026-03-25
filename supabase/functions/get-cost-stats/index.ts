import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_RATE_PER_MIN = 0.05;
const FIRECRAWL_RATE_PER_CRAWL = 0.005;
// TruckingLane ElevenLabs workspace key - hardcoded since Supabase secrets management is complex
// This key only has access to convai/conversations (no user_read permission)
const TRUCKINGLANE_EL_KEY = "3c0cf5fcec2db6e5b0cfb9aed099019b4198f097ef70387a19a3d2008afc8987";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;
    const monthAgo = now - 30 * 86400;

    // Fetch ElevenLabs conversations
    let dailyMins = 0, monthlyMins = 0, allTimeMins = 0;
    let elevenLabsOk = false;
    let pagesCrawled = 0;

    try {
      // Try multiple pages to get full history
      let cursor = null;
      let totalConvs = 0;
      
      for (let i = 0; i < 3; i++) {
        const url = cursor 
          ? `https://api.elevenlabs.io/v1/convai/conversations?page_size=100&cursor=${cursor}`
          : `https://api.elevenlabs.io/v1/convai/conversations?page_size=100`;
        
        const elResp = await fetch(url, {
          headers: { "xi-api-key": TRUCKINGLANE_EL_KEY },
        });
        
        if (!elResp.ok) break;
        
        const elData = await elResp.json();
        const conversations = elData.conversations || [];
        elevenLabsOk = true;
        totalConvs += conversations.length;

        for (const conv of conversations) {
          const secs = conv.call_duration_secs || 0;
          const mins = secs / 60;
          const startTime = conv.start_time_unix_secs || 0;
          allTimeMins += mins;
          if (startTime > monthAgo) monthlyMins += mins;
          if (startTime > dayAgo) dailyMins += mins;
        }

        if (!elData.has_more) break;
        cursor = elData.next_cursor;
      }
    } catch (e) {
      console.error("ElevenLabs fetch failed:", e);
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
      meta: { 
        elevenLabsOk, 
        dailyMins: Math.round(dailyMins * 10) / 10, 
        monthlyMins: Math.round(monthlyMins * 10) / 10,
        allTimeMins: Math.round(allTimeMins * 10) / 10,
        crawlCount: crawlCount || 0
      }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
