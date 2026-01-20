import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Brand colors and styling
const brandColor = "#f97316"; // Orange
const brandName = "Trucking Lane";

interface AuthEmailPayload {
  user: {
    email: string;
    user_metadata?: {
      full_name?: string;
    };
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

function getMagicLinkEmailHtml(
  userName: string,
  confirmUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 480px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 3px solid ${brandColor};">
              <div style="display: inline-block; background-color: ${brandColor}; padding: 12px; border-radius: 10px; margin-bottom: 16px;">
                <span style="font-size: 24px;">🚛</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                ${brandName}
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #18181b;">
                Hi${userName ? ` ${userName}` : ''},
              </h2>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                Click the button below to sign in to your ${brandName} account. This link will expire in 1 hour.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${confirmUrl}" 
                       style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Sign In to ${brandName}
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                If you didn't request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #fafafa; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                © 2025 TruckingLane.com — a Seeksy Product
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getPasswordResetEmailHtml(
  userName: string,
  confirmUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 480px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 3px solid ${brandColor};">
              <div style="display: inline-block; background-color: ${brandColor}; padding: 12px; border-radius: 10px; margin-bottom: 16px;">
                <span style="font-size: 24px;">🚛</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                ${brandName}
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #18181b;">
                Reset Your Password
              </h2>
              <p style="margin: 0 0 8px; font-size: 16px; line-height: 24px; color: #52525b;">
                Hi${userName ? ` ${userName}` : ''},
              </p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                We received a request to reset your password. Click the button below to choose a new password. This link will expire in 1 hour.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${confirmUrl}" 
                       style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #fafafa; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                © 2025 TruckingLane.com — a Seeksy Product
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getSignupConfirmationEmailHtml(
  userName: string,
  confirmUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 480px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 3px solid ${brandColor};">
              <div style="display: inline-block; background-color: ${brandColor}; padding: 12px; border-radius: 10px; margin-bottom: 16px;">
                <span style="font-size: 24px;">🚛</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                Welcome to ${brandName}!
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #18181b;">
                Confirm Your Email
              </h2>
              <p style="margin: 0 0 8px; font-size: 16px; line-height: 24px; color: #52525b;">
                Hi${userName ? ` ${userName}` : ''},
              </p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                Thanks for signing up! Please confirm your email address by clicking the button below.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${confirmUrl}" 
                       style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Confirm Email Address
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #fafafa; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                © 2025 TruckingLane.com — a Seeksy Product
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: AuthEmailPayload = await req.json();
    console.log("Received auth email request:", JSON.stringify(payload, null, 2));

    const { user, email_data } = payload;
    const { token_hash, redirect_to, email_action_type } = email_data;

    const userName = user.user_metadata?.full_name || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    // Build the confirmation URL - encode redirect_to to handle special characters
    const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to)}`;

    let subject: string;
    let html: string;

    switch (email_action_type) {
      case "magiclink":
        subject = `Sign in to ${brandName}`;
        html = getMagicLinkEmailHtml(userName, confirmUrl);
        break;
      case "recovery":
        subject = `Reset your ${brandName} password`;
        html = getPasswordResetEmailHtml(userName, confirmUrl);
        break;
      case "signup":
      case "email_change":
        subject = `Confirm your ${brandName} email`;
        html = getSignupConfirmationEmailHtml(userName, confirmUrl);
        break;
      default:
        subject = `${brandName} - Action Required`;
        html = getMagicLinkEmailHtml(userName, confirmUrl);
    }

    console.log(`Sending ${email_action_type} email to ${user.email}`);

    const { error } = await resend.emails.send({
      from: `${brandName} <info@truckinglane.com>`,
      to: [user.email],
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw error;
    }

    console.log(`Email sent successfully to ${user.email}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending email:", errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: { 
          message: errorMessage 
        } 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});