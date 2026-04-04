import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, lat, lng, accuracy, heading, speed } = await req.json();

    if (!token || !lat || !lng) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Find session by token
    const { data: session, error: sessionError } = await supabase
      .from("tracking_sessions")
      .select("id, status")
      .eq("token", token)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Insert ping
    await supabase.from("tracking_pings").insert({
      session_id: session.id,
      lat,
      lng,
      accuracy,
      heading,
      speed,
    });

    // Update session
    await supabase
      .from("tracking_sessions")
      .update({
        status: "active",
        last_ping_at: new Date().toISOString(),
        started_at: session.status === "pending" ? new Date().toISOString() : undefined,
      })
      .eq("id", session.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
