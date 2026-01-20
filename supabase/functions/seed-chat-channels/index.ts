import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default channels to seed
const DEFAULT_CHANNELS = [
  { name: "general", is_dm: false },
  { name: "high-priority", is_dm: false },
  { name: "carrier-issues", is_dm: false },
];

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

    // Get user's agency
    const { data: membership, error: memberError } = await supabase
      .from('agency_members')
      .select('agency_id, role')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      console.error('Membership error:', memberError);
      return new Response(JSON.stringify({ error: 'User not in an agency' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agencyId = membership.agency_id;
    console.log('Seeding channels for agency:', agencyId);

    // Check if channels already exist
    const { data: existingChannels } = await supabase
      .from('chat_channels')
      .select('name')
      .eq('agency_id', agencyId);

    const existingNames = new Set(existingChannels?.map(c => c.name) || []);
    const channelsToCreate = DEFAULT_CHANNELS.filter(c => !existingNames.has(c.name));

    if (channelsToCreate.length === 0) {
      console.log('All channels already exist');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Channels already exist',
        created: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create the channels
    const { data: newChannels, error: createError } = await supabase
      .from('chat_channels')
      .insert(channelsToCreate.map(c => ({
        ...c,
        agency_id: agencyId,
        created_by: user.id,
      })))
      .select();

    if (createError) {
      console.error('Create channels error:', createError);
      return new Response(JSON.stringify({ error: 'Failed to create channels' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Created channels:', newChannels?.length);

    // Get all agency members
    const { data: allMembers } = await supabase
      .from('agency_members')
      .select('user_id')
      .eq('agency_id', agencyId);

    if (allMembers && allMembers.length > 0 && newChannels) {
      // Add all members to all new channels
      const memberships = [];
      for (const channel of newChannels) {
        for (const member of allMembers) {
          memberships.push({
            channel_id: channel.id,
            user_id: member.user_id,
            role: 'member',
          });
        }
      }

      const { error: membershipError } = await supabase
        .from('chat_channel_members')
        .upsert(memberships, { onConflict: 'channel_id,user_id' });

      if (membershipError) {
        console.error('Membership error:', membershipError);
      } else {
        console.log('Added', memberships.length, 'memberships');
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      created: newChannels?.length || 0,
      channels: newChannels 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in seed-chat-channels:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
