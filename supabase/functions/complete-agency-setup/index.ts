import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompleteSetupRequest {
  token: string;
  password: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { token, password }: CompleteSetupRequest = await req.json();

    if (!token || !password) {
      return new Response(
        JSON.stringify({ error: "Token and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the approved request
    const { data: request, error: requestError } = await supabaseAdmin
      .from("agency_requests")
      .select("*")
      .eq("approval_token", token)
      .eq("status", "approved")
      .single();

    if (requestError || !request) {
      return new Response(
        JSON.stringify({ error: "Invalid setup link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check token expiration
    if (new Date(request.token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This setup link has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create the agency
    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: request.agency_name,
      })
      .select()
      .single();

    if (agencyError) {
      console.error("Agency creation error:", agencyError);
      return new Response(
        JSON.stringify({ error: "Failed to create agency" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create the user
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: request.owner_email.toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: request.owner_name,
        phone: request.owner_phone,
      },
    });

    if (userError) {
      // Rollback agency
      await supabaseAdmin.from("agencies").delete().eq("id", agency.id);
      console.error("User creation error:", userError);
      return new Response(
        JSON.stringify({ error: userError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Add user as agency admin
    const { error: memberError } = await supabaseAdmin
      .from("agency_members")
      .insert({
        user_id: userData.user.id,
        agency_id: agency.id,
        role: "agency_admin",
      });

    if (memberError) {
      // Rollback
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      await supabaseAdmin.from("agencies").delete().eq("id", agency.id);
      console.error("Member creation error:", memberError);
      return new Response(
        JSON.stringify({ error: "Failed to set up agency membership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create default chat channels
    const defaultChannels = [
      { name: "general", agency_id: agency.id, created_by: userData.user.id },
      { name: "high-priority", agency_id: agency.id, created_by: userData.user.id },
      { name: "carrier-issues", agency_id: agency.id, created_by: userData.user.id },
    ];

    const { data: channels } = await supabaseAdmin
      .from("chat_channels")
      .insert(defaultChannels)
      .select();

    if (channels) {
      const memberships = channels.map(channel => ({
        channel_id: channel.id,
        user_id: userData.user.id,
        role: "admin",
      }));

      await supabaseAdmin.from("chat_channel_members").insert(memberships);
    }

    // 5. Invalidate the token by clearing it
    await supabaseAdmin
      .from("agency_requests")
      .update({ approval_token: null })
      .eq("id", request.id);

    return new Response(
      JSON.stringify({
        success: true,
        agencyId: agency.id,
        userId: userData.user.id,
        message: "Agency setup complete",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in complete-agency-setup function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
