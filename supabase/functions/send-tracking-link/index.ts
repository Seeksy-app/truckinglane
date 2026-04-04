import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIMPLETEXTING_MESSAGES_URL = "https://api-app2.simpletexting.com/v2/api/messages";

function normalizePhone(raw: string): string | null {
  const t = raw.replace(/\s/g, "").trim();
  if (!t) return null;
  const d = t.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  if (t.startsWith("+") && d.length >= 10) return "+" + d;
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const simpleKey = Deno.env.get("SIMPLETEXTING_API_KEY");

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { load_id?: string; driver_phone?: string };
    const load_id = body.load_id;
    const driver_phone_override = body.driver_phone;

    if (!load_id) {
      return new Response(JSON.stringify({ error: "load_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: load, error: loadErr } = await admin
      .from("loads")
      .select("id, agency_id, status, dispatch_status, booked_by_phone, load_number")
      .eq("id", load_id)
      .single();

    if (loadErr || !load) {
      return new Response(JSON.stringify({ error: "Load not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: memberships } = await admin
      .from("agency_members")
      .select("agency_id, role")
      .eq("user_id", user.id);

    const isSuper = memberships?.some((m) => m.role === "super_admin");
    const inAgency = memberships?.some((m) => m.agency_id === load.agency_id);
    if (!isSuper && !inAgency) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dispatchOk =
      load.dispatch_status === "open" ||
      load.dispatch_status === null ||
      String(load.dispatch_status).trim() === "";
    const statusOk = load.status === "claimed" || load.status === "booked";
    if (!dispatchOk || !statusOk) {
      return new Response(
        JSON.stringify({ error: "Load is not eligible for tracking link" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawPhone =
      (typeof driver_phone_override === "string" && driver_phone_override.trim()
        ? driver_phone_override
        : load.booked_by_phone) || "";
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      return new Response(JSON.stringify({ error: "Driver phone required", need_phone: true }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!simpleKey) {
      return new Response(JSON.stringify({ error: "SMS not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = crypto.randomUUID();
    const baseUrl = (Deno.env.get("TRACKING_PUBLIC_BASE_URL") || "https://truckinglane.com").replace(
      /\/$/,
      "",
    );
    const trackUrl = `${baseUrl}/track/${token}`;
    const message =
      `Hi, this is D&L Transport tracking your load. When you pick up, tap this link to share your location: ${trackUrl} — Reply STOP to opt out.`;

    const { data: inserted, error: insErr } = await admin
      .from("tracking_sessions")
      .insert({
        token,
        load_id: load.id,
        agency_id: load.agency_id,
        driver_phone: phone,
        status: "pending",
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      console.error(insErr);
      return new Response(JSON.stringify({ error: insErr?.message || "Insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stRes = await fetch(SIMPLETEXTING_MESSAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${simpleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contactPhone: phone, text: message }),
    });

    if (!stRes.ok) {
      const txt = await stRes.text();
      console.error("SimpleTexting error", stRes.status, txt);
      await admin.from("tracking_sessions").delete().eq("id", inserted.id);
      return new Response(
        JSON.stringify({ error: `SMS failed: ${txt.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, phone_e164: phone }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
