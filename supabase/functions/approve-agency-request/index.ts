import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApproveRequestBody {
  requestId: string;
  action: "approve" | "reject";
  rejectionReason?: string;
}

serve(async (req: Request) => {
  console.log("approve-agency-request function invoked");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    console.log("Auth header present:", !!authHeader);
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

    // Verify user is super_admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: membership } = await supabaseAdmin
      .from("agency_members")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Only platform owners can approve agency requests" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { requestId, action, rejectionReason }: ApproveRequestBody = await req.json();

    if (!requestId || !action) {
      return new Response(
        JSON.stringify({ error: "Request ID and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the request
    const { data: request, error: requestError } = await supabaseAdmin
      .from("agency_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (requestError || !request) {
      return new Response(
        JSON.stringify({ error: "Request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (request.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "This request has already been processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reject") {
      // Update request status to rejected
      await supabaseAdmin
        .from("agency_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || null,
        })
        .eq("id", requestId);

      // Send rejection email
      await resend.emails.send({
        from: "Trucking Lane <onboarding@resend.dev>",
        to: [request.owner_email],
        subject: "Update on Your Trucking Lane Agency Request",
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; padding: 40px 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px;">
              <h1 style="color: #18181b; font-size: 24px; margin: 0 0 16px;">Agency Request Update</h1>
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
                Hi ${request.owner_name},
              </p>
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
                Thank you for your interest in Trucking Lane. After reviewing your request for <strong>${request.agency_name}</strong>, we're unable to approve your account at this time.
              </p>
              ${rejectionReason ? `<p style="color: #3f3f46; font-size: 16px; line-height: 1.6;"><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
                If you have questions, please reply to this email.
              </p>
              <p style="color: #71717a; font-size: 14px; margin-top: 24px;">
                — The Trucking Lane Team
              </p>
            </div>
          </body>
          </html>
        `,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Request rejected" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Approve the request
    // Generate new approval token
    const approvalToken = crypto.randomUUID() + crypto.randomUUID();

    await supabaseAdmin
      .from("agency_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        approval_token: approvalToken,
        token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .eq("id", requestId);

    // Send approval email with setup link
    const appUrl = Deno.env.get("APP_URL") || "https://vjgakkomhphvdbwjjwiv.lovable.app";
    const setupUrl = `${appUrl}/complete-agency-setup?token=${approvalToken}`;
    console.log("APP_URL:", appUrl);
    console.log("Sending approval email to:", request.owner_email);
    console.log("Setup URL:", setupUrl);

    const emailResult = await resend.emails.send({
      from: "Trucking Lane <onboarding@resend.dev>",
      to: [request.owner_email],
      subject: "🎉 Your Trucking Lane Agency Has Been Approved!",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px;">
            <h1 style="color: #18181b; font-size: 24px; margin: 0 0 16px;">Welcome to Trucking Lane!</h1>
            <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
              Hi ${request.owner_name},
            </p>
            <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
              Great news! Your agency request for <strong>${request.agency_name}</strong> has been approved.
            </p>
            <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
              Click the button below to complete your account setup, set your password, and invite your team.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${setupUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Complete Account Setup
              </a>
            </div>
            <p style="color: #71717a; font-size: 14px; text-align: center;">
              This link expires in 7 days.
            </p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
            <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
              If you didn't request this, please ignore this email.
            </p>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log("Email send result:", JSON.stringify(emailResult));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Request approved and email sent",
        setupUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in approve-agency-request function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
