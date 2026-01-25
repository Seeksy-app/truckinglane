import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteSuperAdminRequest {
  email: string;
  fullName?: string;
}

serve(async (req: Request) => {
  console.log("=== INVITE SUPER ADMIN ===");
  
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

    // Verify user is a super_admin
    const { data: membership } = await supabaseAdmin
      .from("agency_members")
      .select("agency_id, role")
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Only super admins can invite other super admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, fullName }: InviteSuperAdminRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      // Check if already a super_admin
      const { data: existingMember } = await supabaseAdmin
        .from("agency_members")
        .select("id, role")
        .eq("user_id", existingUser.id)
        .eq("role", "super_admin")
        .maybeSingle();

      if (existingMember) {
        return new Response(
          JSON.stringify({ error: "This user is already a super admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = existingUser.id;
      
      // Update existing membership to super_admin or create new one
      const { data: anyMembership } = await supabaseAdmin
        .from("agency_members")
        .select("id, agency_id")
        .eq("user_id", existingUser.id)
        .maybeSingle();

      if (anyMembership) {
        // Update existing membership to super_admin
        await supabaseAdmin
          .from("agency_members")
          .update({ role: "super_admin" })
          .eq("id", anyMembership.id);
      } else {
        // Add as super_admin to the same agency as the inviter
        await supabaseAdmin
          .from("agency_members")
          .insert({
            user_id: userId,
            agency_id: membership.agency_id,
            role: "super_admin",
          });
      }
    } else {
      // Create new user
      isNewUser = true;
      const randomPassword = crypto.randomUUID() + crypto.randomUUID();
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || normalizedEmail.split("@")[0],
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;

      // Add as super_admin to the same agency as the inviter
      const { error: insertError } = await supabaseAdmin
        .from("agency_members")
        .insert({
          user_id: userId,
          agency_id: membership.agency_id,
          role: "super_admin",
        });

      if (insertError) {
        console.error("Error adding super admin member:", insertError);
        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get inviter's name
    const { data: inviterProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const inviterName = inviterProfile?.full_name || user.email;

    // Send notification email
    const appUrl = Deno.env.get("APP_URL") || "https://truckinglane.lovable.app";
    
    try {
      await resend.emails.send({
        from: "Trucking Lane <onboarding@resend.dev>",
        to: [normalizedEmail],
        subject: "You've been granted Super Admin access on Trucking Lane",
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
                <h1 style="color: #18181b; font-size: 24px; margin: 0;">🎉 Super Admin Access Granted</h1>
              </div>
              
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                ${inviterName} has granted you <strong>Super Admin</strong> access on Trucking Lane.
              </p>
              
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                As a Super Admin, you have full platform access including:
              </p>
              
              <ul style="color: #3f3f46; font-size: 15px; line-height: 1.8; margin: 0 0 24px; padding-left: 20px;">
                <li>View and manage all agencies</li>
                <li>Approve or reject agency requests</li>
                <li>Access platform-wide analytics</li>
                <li>Impersonate any agency for support</li>
              </ul>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}/auth" style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  ${isNewUser ? "Set Up Your Account" : "Sign In to Platform"}
                </a>
              </div>
              
              ${isNewUser ? `
              <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0; text-align: center;">
                You'll need to reset your password on first login.
              </p>
              ` : ""}
              
              <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
              
              <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
                If you didn't expect this, please contact support immediately.
              </p>
            </div>
          </body>
          </html>
        `,
      });
      console.log("Super admin invite email sent to:", normalizedEmail);
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      // Continue even if email fails - the user is still added
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: isNewUser 
          ? "Super admin invited successfully. They will receive an email to set up their account." 
          : "User has been promoted to super admin.",
        email: normalizedEmail,
        isNewUser,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in invite-super-admin function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
