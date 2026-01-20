import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
  action: "send" | "verify";
  code?: string;
  sessionId?: string;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, action, code, sessionId } = (await req.json()) as RequestBody;
    const ipAddress = req.headers.get("x-forwarded-for") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    console.log(`[send-trust-code] Action: ${action}, Email: ${email}`);

    // Check if page is enabled
    const { data: settings } = await supabase
      .from("trust_page_settings")
      .select("*")
      .single();

    if (!settings?.is_enabled) {
      return new Response(
        JSON.stringify({ error: "This page is currently disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check domain/email restrictions
    if (settings.allowed_emails?.length || settings.allowed_domains?.length) {
      const emailDomain = email.split("@")[1];
      const emailAllowed = settings.allowed_emails?.includes(email);
      const domainAllowed = settings.allowed_domains?.includes(emailDomain);
      
      if (!emailAllowed && !domainAllowed) {
        return new Response(
          JSON.stringify({ error: "Access restricted" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "send") {
      const verificationCode = generateCode();
      const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Create session record
      const { data: session, error: sessionError } = await supabase
        .from("trust_page_sessions")
        .insert({
          email,
          code: verificationCode,
          code_expires_at: codeExpiresAt.toISOString(),
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .select()
        .single();

      if (sessionError) {
        console.error("[send-trust-code] Session insert error:", sessionError);
        throw sessionError;
      }

      // Log access attempt
      await supabase.from("trust_page_access_logs").insert({
        session_id: session.id,
        email,
        action: "code_requested",
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      // Send email via Resend
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        
        const { error: emailError } = await resend.emails.send({
          from: "Trucking Lane <info@truckinglane.com>",
          to: [email],
          subject: "Your Access Code for Trucking Lane",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #f5f5f5;">
              <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">Trucking Lane</h1>
                <p style="color: #666; font-size: 14px; margin-bottom: 32px;">AI-Driven Dispatch Intelligence</p>
                
                <p style="color: #333; font-size: 16px; margin-bottom: 24px;">
                  Enter this code to access the Trucking Lane information page:
                </p>
                
                <div style="background: #f8f8f8; border: 2px solid #e5e5e5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${verificationCode}</span>
                </div>
                
                <p style="color: #666; font-size: 14px; margin-bottom: 8px;">
                  This code expires in 10 minutes.
                </p>
                
                <p style="color: #999; font-size: 12px; margin-top: 32px;">
                  If you didn't request this code, you can safely ignore this email.
                </p>
              </div>
            </body>
            </html>
          `,
        });

        if (emailError) {
          console.error("[send-trust-code] Email error:", emailError);
        }
      } else {
        console.log("[send-trust-code] No RESEND_API_KEY, code:", verificationCode);
      }

      return new Response(
        JSON.stringify({ success: true, sessionId: session.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      if (!code || !sessionId) {
        return new Response(
          JSON.stringify({ error: "Code and session ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get session
      const { data: session, error: sessionFetchError } = await supabase
        .from("trust_page_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessionFetchError || !session) {
        return new Response(
          JSON.stringify({ error: "Invalid session" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if already revoked
      if (session.revoked_at) {
        return new Response(
          JSON.stringify({ error: "Session has been revoked" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if code expired
      if (new Date(session.code_expires_at) < new Date()) {
        await supabase.from("trust_page_access_logs").insert({
          session_id: sessionId,
          email: session.email,
          action: "code_expired",
          ip_address: ipAddress,
          user_agent: userAgent,
        });

        return new Response(
          JSON.stringify({ error: "Code expired" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify code
      if (session.code !== code) {
        await supabase.from("trust_page_access_logs").insert({
          session_id: sessionId,
          email: session.email,
          action: "code_invalid",
          ip_address: ipAddress,
          user_agent: userAgent,
        });

        return new Response(
          JSON.stringify({ error: "Invalid code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark as verified, set session expiry to 24 hours
      const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const { error: updateError } = await supabase
        .from("trust_page_sessions")
        .update({
          verified_at: new Date().toISOString(),
          session_expires_at: sessionExpiresAt.toISOString(),
        })
        .eq("id", sessionId);

      if (updateError) {
        console.error("[send-trust-code] Update error:", updateError);
        throw updateError;
      }

      // Log successful verification
      await supabase.from("trust_page_access_logs").insert({
        session_id: sessionId,
        email: session.email,
        action: "verified",
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          sessionExpiresAt: sessionExpiresAt.toISOString(),
          email: session.email,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[send-trust-code] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});