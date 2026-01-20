import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, phone, message, type = 'mention' } = await req.json();
    console.log('SMS notification request:', { user_id, phone, type });

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'phone and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check throttle - max 1 SMS per user per 2 minutes
    if (user_id) {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      
      const { data: recentNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user_id)
        .eq('type', 'sms_sent')
        .gte('created_at', twoMinutesAgo)
        .limit(1);
      
      if (recentNotif && recentNotif.length > 0) {
        console.log('SMS throttled for user:', user_id);
        return new Response(JSON.stringify({ success: false, reason: 'throttled' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check user's notification settings if user_id provided
    if (user_id) {
      const { data: settings } = await supabase
        .from('notification_settings')
        .select('sms_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
        .eq('user_id', user_id)
        .single();

      if (settings) {
        if (!settings.sms_enabled) {
          console.log('SMS disabled for user:', user_id);
          return new Response(JSON.stringify({ success: false, reason: 'sms_disabled' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (isInQuietHours(settings)) {
          console.log('Quiet hours active for user:', user_id);
          return new Response(JSON.stringify({ success: false, reason: 'quiet_hours' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const twilioSid = Deno.env.get('TWILIO_SID');
    const twilioToken = Deno.env.get('TWILIO_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_FROM');

    if (!twilioSid || !twilioToken || !twilioFrom) {
      console.error('Twilio not configured');
      return new Response(JSON.stringify({ error: 'SMS service not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: twilioFrom,
          Body: message,
        }),
      }
    );

    if (response.ok) {
      const result = await response.json();
      console.log('SMS sent successfully:', result.sid);

      // Log SMS sent for throttling
      if (user_id) {
        await supabase.from('notifications').insert({
          user_id,
          type: 'sms_sent',
          title: 'SMS Notification Sent',
          body: message.substring(0, 200),
          meta: { phone, twilio_sid: result.sid },
        });
      }

      return new Response(JSON.stringify({ success: true, sid: result.sid }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const error = await response.text();
      console.error('Twilio error:', error);
      return new Response(JSON.stringify({ error: 'Failed to send SMS', details: error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error in notify-sms:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function isInQuietHours(settings: any): boolean {
  if (!settings?.quiet_hours_enabled) return false;
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinutes;
  
  const [startHour, startMin] = (settings.quiet_hours_start || '22:00').split(':').map(Number);
  const [endHour, endMin] = (settings.quiet_hours_end || '07:00').split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  if (startTime < endTime) {
    return currentTime >= startTime && currentTime < endTime;
  } else {
    return currentTime >= startTime || currentTime < endTime;
  }
}
