import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch request by token
    const { data: request, error: requestError } = await supabaseAdmin
      .from("agency_requests")
      .select("*")
      .eq("approval_token", token)
      .eq("status", "approved")
      .single();

    if (requestError || !request) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired setup link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token expired
    if (new Date(request.token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This setup link has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already completed (user exists with agency membership)
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === request.owner_email.toLowerCase());

    if (existingUser) {
      const { data: membership } = await supabaseAdmin
        .from("agency_members")
        .select("id")
        .eq("user_id", existingUser.id)
        .single();

      if (membership) {
        return new Response(
          JSON.stringify({ error: "This account has already been set up. Please sign in." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        request: {
          id: request.id,
          agency_name: request.agency_name,
          owner_name: request.owner_name,
          owner_email: request.owner_email,
          owner_phone: request.owner_phone,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in get-agency-request function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
