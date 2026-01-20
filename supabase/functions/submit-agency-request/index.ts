import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface SubmitRequestBody {
  agencyName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  agentCount?: string;
  dailyLoadVolume?: string;
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

    const { 
      agencyName, 
      ownerName, 
      ownerEmail, 
      ownerPhone,
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
      agentCount,
      dailyLoadVolume,
    }: SubmitRequestBody = await req.json();

    // Validate inputs
    if (!agencyName || !ownerName || !ownerEmail) {
      return new Response(
        JSON.stringify({ error: "Agency name, owner name, and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for existing pending request with same email
    const { data: existingRequest } = await supabaseAdmin
      .from("agency_requests")
      .select("id, status")
      .eq("owner_email", ownerEmail.toLowerCase())
      .eq("status", "pending")
      .single();

    if (existingRequest) {
      return new Response(
        JSON.stringify({ error: "A request with this email is already pending review" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists as agency member
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === ownerEmail.toLowerCase());

    if (existingUser) {
      const { data: membership } = await supabaseAdmin
        .from("agency_members")
        .select("id")
        .eq("user_id", existingUser.id)
        .single();

      if (membership) {
        return new Response(
          JSON.stringify({ error: "An account with this email already exists. Please sign in." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Build the full address string for legacy compatibility
    const addressParts = [addressLine1, addressLine2, city, state, zip].filter(Boolean);
    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

    // Create the request
    const { data: request, error: insertError } = await supabaseAdmin
      .from("agency_requests")
      .insert({
        agency_name: agencyName,
        owner_name: ownerName,
        owner_email: ownerEmail.toLowerCase(),
        owner_phone: ownerPhone || null,
        owner_address: fullAddress,
        address_line1: addressLine1 || null,
        address_line2: addressLine2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        agent_count: agentCount || null,
        daily_load_volume: dailyLoadVolume || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to submit request" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Agency request submitted:", {
      id: request.id,
      agency: agencyName,
      email: ownerEmail,
      agentCount,
      dailyLoadVolume,
    });

    // Send confirmation email to the applicant
    try {
      const emailResponse = await resend.emails.send({
        from: "Trucking Lane <onboarding@resend.dev>",
        to: [ownerEmail],
        subject: "Your Agency Application is Under Review",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">🚚 Trucking Lane</h1>
              </div>
              
              <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
                <h2 style="margin: 0 0 10px 0; font-size: 22px;">Application Received!</h2>
                <p style="margin: 0; opacity: 0.9;">We're reviewing your agency application</p>
              </div>
              
              <p style="font-size: 16px;">Hi ${ownerName},</p>
              
              <p style="font-size: 16px;">Thank you for your interest in joining <strong>Trucking Lane</strong>! We've received your application for <strong>${agencyName}</strong> and it's currently under review.</p>
              
              <div style="background: #f8f9fa; border-left: 4px solid #f97316; padding: 15px 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #1a1a1a;">What happens next?</h3>
                <ul style="margin: 0; padding-left: 20px; color: #555;">
                  <li style="margin-bottom: 8px;">Our team will review your application</li>
                  <li style="margin-bottom: 8px;">You'll receive an approval email shortly</li>
                  <li style="margin-bottom: 8px;">Complete your account setup with the link provided</li>
                  <li style="margin-bottom: 0;">Start inviting your agents and booking loads!</li>
                </ul>
              </div>
              
              <p style="font-size: 16px;">We typically review applications within 24-48 hours. If you have any questions in the meantime, feel free to reach out.</p>
              
              <p style="font-size: 16px; margin-top: 30px;">
                Best regards,<br>
                <strong>The Trucking Lane Team</strong>
              </p>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              
              <p style="font-size: 12px; color: #888; text-align: center;">
                This email was sent because you submitted an agency application at Trucking Lane.<br>
                If you didn't submit this application, please ignore this email.
              </p>
            </body>
          </html>
        `,
      });

      console.log("Confirmation email sent:", emailResponse);
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error("Failed to send confirmation email:", emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        requestId: request.id,
        message: "Request submitted successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in submit-agency-request function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
