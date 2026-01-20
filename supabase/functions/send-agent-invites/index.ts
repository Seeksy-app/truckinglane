import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  email: string;
  role: "agent" | "agency_admin";
}

interface SendInvitesRequest {
  agencyId: string;
  invites: InviteRequest[];
}

serve(async (req: Request) => {
  console.log("=== SEND AGENT INVITES ===");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    // Get the requesting user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is an admin
    const { data: membership } = await supabaseAdmin
      .from("agency_members")
      .select("agency_id, role")
      .eq("user_id", user.id)
      .single();

    if (!membership || (membership.role !== "agency_admin" && membership.role !== "super_admin")) {
      return new Response(
        JSON.stringify({ error: "Only admins can send invites" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { agencyId, invites }: SendInvitesRequest = await req.json();

    // Verify the agency matches
    if (agencyId !== membership.agency_id) {
      return new Response(
        JSON.stringify({ error: "Agency mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get agency name for email
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("name")
      .eq("id", agencyId)
      .single();

    const agencyName = agency?.name || "Your Agency";

    // Get inviter's name
    const { data: inviterProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const inviterName = inviterProfile?.full_name || user.email;

    console.log("Processing invites for agency:", agencyName);
    console.log("Invites to send:", JSON.stringify(invites));
    
    const results = [];

    for (const invite of invites) {
      try {
        // Create invite record with token
        const { data: inviteRecord, error: inviteError } = await supabaseAdmin
          .from("agent_invites")
          .insert({
            agency_id: agencyId,
            email: invite.email.toLowerCase(),
            role: invite.role,
            invited_by: user.id,
          })
          .select()
          .single();

        if (inviteError) {
          results.push({ email: invite.email, success: false, error: inviteError.message });
          continue;
        }

        // Send invite email
        const appUrl = Deno.env.get("APP_URL") || "https://truckinglane.com";
        const inviteUrl = `${appUrl}/accept-invite?token=${inviteRecord.token}`;
        
        console.log("Sending email to:", invite.email);
        console.log("Invite URL:", inviteUrl);

        const { data: emailData, error: emailError } = await resend.emails.send({
          from: "Trucking Lane <onboarding@resend.dev>",
          to: [invite.email],
          subject: `You've been invited to join ${agencyName} on Trucking Lane`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; padding: 40px 20px;">
              <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 32px;">
                  <h1 style="color: #18181b; font-size: 24px; margin: 0;">You're Invited!</h1>
                </div>
                
                <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                  ${inviterName} has invited you to join <strong>${agencyName}</strong> on Trucking Lane as ${invite.role === "agency_admin" ? "an Admin" : "an Agent"}.
                </p>
                
                <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                  Click the button below to accept your invitation and set up your account.
                </p>
                
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                    Accept Invitation
                  </a>
                </div>
                
                <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0; text-align: center;">
                  This invitation expires in 7 days.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
                
                <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
                  If you didn't expect this invitation, you can safely ignore this email.
                </p>
              </div>
            </body>
            </html>
          `,
        });

        if (emailError) {
          console.error("Email error:", JSON.stringify(emailError));
          results.push({ email: invite.email, success: false, error: emailError.message || "Failed to send email" });
        } else {
          console.log("Email sent successfully:", JSON.stringify(emailData));
          results.push({ email: invite.email, success: true });
        }
      } catch (err) {
        console.error("Invite error:", err);
        results.push({ email: invite.email, success: false, error: "Failed to process invite" });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        total: invites.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in send-agent-invites function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
