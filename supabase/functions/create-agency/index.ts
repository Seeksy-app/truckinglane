import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateAgencyRequest {
  agencyName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
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

    const { agencyName, ownerName, ownerEmail, ownerPhone, password }: CreateAgencyRequest = await req.json();

    // Validate inputs
    if (!agencyName || !ownerName || !ownerEmail || !password) {
      return new Response(
        JSON.stringify({ error: "All fields are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === ownerEmail.toLowerCase());

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "An account with this email already exists. Please sign in." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create the agency
    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: agencyName,
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
      email: ownerEmail.toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: ownerName,
        phone: ownerPhone,
      },
    });

    if (userError) {
      // Rollback: delete the agency
      await supabaseAdmin.from("agencies").delete().eq("id", agency.id);
      console.error("User creation error:", userError);
      return new Response(
        JSON.stringify({ error: userError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Add user as agency owner/admin
    const { error: memberError } = await supabaseAdmin
      .from("agency_members")
      .insert({
        user_id: userData.user.id,
        agency_id: agency.id,
        role: "agency_admin", // Owner role
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

    const { data: channels, error: channelsError } = await supabaseAdmin
      .from("chat_channels")
      .insert(defaultChannels)
      .select();

    if (!channelsError && channels) {
      // Add owner to all channels
      const memberships = channels.map(channel => ({
        channel_id: channel.id,
        user_id: userData.user.id,
        role: "admin",
      }));

      await supabaseAdmin.from("chat_channel_members").insert(memberships);
    }

    return new Response(
      JSON.stringify({
        success: true,
        agencyId: agency.id,
        userId: userData.user.id,
        message: "Agency created successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in create-agency function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
