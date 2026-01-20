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

    // Get the user from the JWT
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { channel_id, body, mentions = [] } = await req.json();
    console.log('Sending message:', { channel_id, body, mentions, sender: user.id });

    if (!channel_id || !body?.trim()) {
      return new Response(JSON.stringify({ error: 'channel_id and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is a member of the channel
    const { data: membership, error: memberError } = await supabase
      .from('chat_channel_members')
      .select('id')
      .eq('channel_id', channel_id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      console.error('Membership check failed:', memberError);
      return new Response(JSON.stringify({ error: 'Not a member of this channel' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert the message
    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        channel_id,
        sender_id: user.id,
        body: body.trim(),
        mentions,
      })
      .select('*, sender:profiles!sender_id(id, full_name, email, avatar_url)')
      .single();

    if (messageError) {
      console.error('Message insert error:', messageError);
      return new Response(JSON.stringify({ error: 'Failed to send message' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Message inserted:', message.id);

    // Get channel info for notification
    const { data: channel } = await supabase
      .from('chat_channels')
      .select('name, is_dm')
      .eq('id', channel_id)
      .single();

    // Get sender name
    const { data: sender } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const senderName = sender?.full_name || sender?.email || 'Someone';

    // Get all channel members except sender
    const { data: members } = await supabase
      .from('chat_channel_members')
      .select('user_id')
      .eq('channel_id', channel_id)
      .neq('user_id', user.id);

    if (members && members.length > 0) {
      // Get notification settings for all members
      const memberIds = members.map(m => m.user_id);
      const { data: settings } = await supabase
        .from('notification_settings')
        .select('*')
        .in('user_id', memberIds);

      const settingsMap = new Map(settings?.map(s => [s.user_id, s]) || []);

      // Create notifications for each member
      const notifications = [];
      const smsRecipients = [];

      for (const member of members) {
        const userSettings = settingsMap.get(member.user_id);
        const isMentioned = mentions.includes(member.user_id);
        
        // Check if user wants notifications
        const chatEnabled = userSettings?.chat_enabled !== false;
        const onlyMentions = userSettings?.chat_only_mentions === true;
        
        // Skip if only mentions and not mentioned
        if (onlyMentions && !isMentioned) {
          continue;
        }

        // Check quiet hours
        const inQuietHours = isInQuietHours(userSettings);
        
        if (chatEnabled) {
          notifications.push({
            user_id: member.user_id,
            type: isMentioned ? 'chat_mention' : 'chat_message',
            title: isMentioned ? `${senderName} mentioned you` : `New message in #${channel?.name || 'chat'}`,
            body: body.length > 100 ? body.substring(0, 100) + '...' : body,
            meta: {
              channel_id,
              message_id: message.id,
              sender_id: user.id,
              sender_name: senderName,
              is_mention: isMentioned,
            },
          });
        }

        // Check if SMS should be sent for mentions
        if (isMentioned && userSettings?.sms_enabled && userSettings?.sms_phone && !inQuietHours) {
          smsRecipients.push({
            user_id: member.user_id,
            phone: userSettings.sms_phone,
            message: `${senderName} mentioned you in Team Chat: "${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"`,
          });
        }
      }

      // Insert notifications
      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notifications);
        
        if (notifError) {
          console.error('Failed to create notifications:', notifError);
        } else {
          console.log(`Created ${notifications.length} notifications`);
        }
      }

      // Send SMS for mentions (with throttling)
      for (const recipient of smsRecipients) {
        try {
          await sendSmsNotification(supabase, recipient);
        } catch (e) {
          console.error('SMS send failed:', e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in chat-send-message:', error);
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
    // Quiet hours span midnight
    return currentTime >= startTime || currentTime < endTime;
  }
}

async function sendSmsNotification(supabase: any, recipient: { user_id: string; phone: string; message: string }) {
  // Check throttle - max 1 SMS per user per 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  
  const { data: recentNotif } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', recipient.user_id)
    .eq('type', 'sms_sent')
    .gte('created_at', twoMinutesAgo)
    .limit(1);
  
  if (recentNotif && recentNotif.length > 0) {
    console.log('SMS throttled for user:', recipient.user_id);
    return;
  }

  const twilioSid = Deno.env.get('TWILIO_SID');
  const twilioToken = Deno.env.get('TWILIO_TOKEN');
  const twilioFrom = Deno.env.get('TWILIO_FROM');

  if (!twilioSid || !twilioToken || !twilioFrom) {
    console.log('Twilio not configured, skipping SMS');
    return;
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: recipient.phone,
          From: twilioFrom,
          Body: recipient.message,
        }),
      }
    );

    if (response.ok) {
      console.log('SMS sent to:', recipient.phone);
      // Log SMS sent for throttling
      await supabase.from('notifications').insert({
        user_id: recipient.user_id,
        type: 'sms_sent',
        title: 'SMS Notification Sent',
        body: recipient.message,
        meta: { phone: recipient.phone },
      });
    } else {
      const error = await response.text();
      console.error('Twilio error:', error);
    }
  } catch (e) {
    console.error('SMS send error:', e);
  }
}
