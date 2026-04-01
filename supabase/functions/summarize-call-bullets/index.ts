import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-20250514";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { summary?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = String(body.summary ?? "").trim();
  if (!summary) {
    return new Response(JSON.stringify({ bullets: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clipped = summary.length > 12000 ? summary.slice(0, 12000) : summary;

  if (!anthropicKey) {
    return new Response(
      JSON.stringify({
        error: "Summarization unavailable",
        bullets: [],
        fallback: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const userPrompt =
    `Convert this call summary into 3-4 concise bullet points for a freight dispatcher. Focus on: load details, driver intent, outcome, and next action needed.\n\nSummary:\n${clipped}\n\nRespond with ONLY valid JSON, no markdown, in this exact shape: {"bullets":["point 1","point 2","point 3"]} Use 3 or 4 strings. Each string must be a single bullet without a leading dash.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("[summarize-call-bullets] Anthropic error:", res.status, t.slice(0, 400));
    return new Response(JSON.stringify({ bullets: [], error: "model_error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  let bullets: string[] = [];
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]) as { bullets?: unknown };
      if (Array.isArray(parsed.bullets)) {
        bullets = parsed.bullets
          .map((b) => String(b ?? "").trim())
          .filter(Boolean)
          .slice(0, 6);
      }
    }
  } catch (e) {
    console.error("[summarize-call-bullets] JSON parse:", e);
  }

  return new Response(JSON.stringify({ bullets }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
