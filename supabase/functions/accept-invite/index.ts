import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AcceptInviteRequest {
  token: string;
  fullName: string;
  phone?: string;
  password: string;
  avatarUrl?: string;
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

    const { token, fullName, phone, password, avatarUrl }: AcceptInviteRequest = await req.json();

    // Validate inputs
    if (!token || !fullName || !password) {
      return new Response(
        JSON.stringify({ error: "Token, name, and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("agent_invites")
      .select("*")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invalid invite token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already accepted
    if (invite.accepted_at) {
      return new Response(
        JSON.stringify({ error: "This invite has already been used" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This invite has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === invite.email.toLowerCase());

    let userId: string;

    if (existingUser) {
      // User exists - update password and profile
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password,
        user_metadata: {
          full_name: fullName,
          phone,
        },
      });

      if (updateError) {
        console.error("Update user error:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update account" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = existingUser.id;

      // Update profile
      await supabaseAdmin
        .from("profiles")
        .update({
          full_name: fullName,
          avatar_url: avatarUrl || null,
        })
        .eq("id", userId);
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: invite.email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
        },
      });

      if (createError) {
        console.error("Create user error:", createError);
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;

      // Update profile with avatar if provided
      if (avatarUrl) {
        await supabaseAdmin
          .from("profiles")
          .update({ avatar_url: avatarUrl })
          .eq("id", userId);
      }
    }

    // Add to agency_members
    const { error: memberError } = await supabaseAdmin
      .from("agency_members")
      .upsert({
        user_id: userId,
        agency_id: invite.agency_id,
        role: invite.role,
      }, {
        onConflict: 'user_id,agency_id',
      });

    if (memberError) {
      console.error("Member upsert error:", memberError);
      // Try insert without upsert
      await supabaseAdmin
        .from("agency_members")
        .insert({
          user_id: userId,
          agency_id: invite.agency_id,
          role: invite.role,
        });
    }

    // Add user to default channels
    const { data: channels } = await supabaseAdmin
      .from("chat_channels")
      .select("id")
      .eq("agency_id", invite.agency_id)
      .in("name", ["general", "high-priority", "carrier-issues"]);

    if (channels && channels.length > 0) {
      const memberships = channels.map(channel => ({
        channel_id: channel.id,
        user_id: userId,
        role: "member",
      }));

      await supabaseAdmin
        .from("chat_channel_members")
        .upsert(memberships, { onConflict: 'channel_id,user_id' });
    }

    // Mark invite as accepted
    await supabaseAdmin
      .from("agent_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        message: "Invite accepted successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in accept-invite function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
