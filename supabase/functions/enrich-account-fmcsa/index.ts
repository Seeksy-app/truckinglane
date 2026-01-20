import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrichRequest {
  account_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { account_id } = await req.json() as EnrichRequest;
    
    if (!account_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'account_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fmcsaApiKey = Deno.env.get('FMCSA_API_KEY');
    if (!fmcsaApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FMCSA API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get account
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', account_id)
      .single();

    if (fetchError || !account) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Need MC or DOT number to enrich
    if (!account.mc_number && !account.dot_number) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account has no MC or DOT number for FMCSA lookup' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let fmcsaData = null;
    let lookupType = '';

    // Try DOT number first
    if (account.dot_number) {
      lookupType = 'DOT';
      const dotClean = account.dot_number.replace(/\D/g, '');
      const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotClean}?webKey=${fmcsaApiKey}`;
      
      console.log(`Looking up DOT: ${dotClean}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          fmcsaData = data.content?.carrier || data.carrier || data;
        }
      } catch (e) {
        console.error('FMCSA DOT lookup error:', e);
      }
    }

    // Try MC number if DOT failed
    if (!fmcsaData && account.mc_number) {
      lookupType = 'MC';
      const mcClean = account.mc_number.replace(/\D/g, '');
      const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${mcClean}?webKey=${fmcsaApiKey}`;
      
      console.log(`Looking up MC: ${mcClean}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          fmcsaData = data.content?.carrier || data.carrier || data;
        }
      } catch (e) {
        console.error('FMCSA MC lookup error:', e);
      }
    }

    if (!fmcsaData) {
      // Log failed enrichment attempt
      await supabase.from('account_events').insert({
        account_id,
        event_type: 'enriched',
        meta: { success: false, lookup_type: lookupType, reason: 'Carrier not found in FMCSA' }
      });

      return new Response(
        JSON.stringify({ success: false, error: 'Carrier not found in FMCSA database' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract key info from FMCSA data
    const carrierName = fmcsaData.legalName || fmcsaData.dbaName || account.name;
    const dotNumber = fmcsaData.dotNumber?.toString() || account.dot_number;
    const mcNumber = fmcsaData.mcNumber?.toString() || account.mc_number;
    
    // Determine carrier status
    const allowedToOperate = fmcsaData.allowedToOperate === 'Y' || fmcsaData.allowedToOperate === true;
    const commonAuthority = fmcsaData.commonAuthorityStatus;
    const contractAuthority = fmcsaData.contractAuthorityStatus;
    const brokerAuthority = fmcsaData.brokerAuthorityStatus;
    
    // Build AI notes based on FMCSA data
    const notes: string[] = [];
    
    if (allowedToOperate) {
      notes.push('✓ Allowed to operate');
    } else {
      notes.push('⚠ NOT allowed to operate');
    }
    
    if (fmcsaData.bipdInsuranceOnFile === 'Y') {
      notes.push('✓ Insurance on file');
    }
    
    if (fmcsaData.totalPowerUnits) {
      notes.push(`Fleet size: ${fmcsaData.totalPowerUnits} power units`);
    }
    
    if (commonAuthority === 'A') notes.push('✓ Common carrier authority active');
    if (contractAuthority === 'A') notes.push('✓ Contract carrier authority active');
    if (brokerAuthority === 'A') notes.push('✓ Broker authority active');
    
    // Determine account type based on authorities
    let accountType = account.type;
    if (brokerAuthority === 'A' && accountType === 'unknown') {
      accountType = 'broker';
    } else if ((commonAuthority === 'A' || contractAuthority === 'A') && accountType === 'unknown') {
      accountType = 'carrier';
    }

    // Update account with FMCSA data
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        name: carrierName,
        dot_number: dotNumber,
        mc_number: mcNumber,
        type: accountType,
        fmcsa_data: fmcsaData,
        ai_notes: notes.join('\n'),
        updated_at: new Date().toISOString()
      })
      .eq('id', account_id);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log enrichment event
    await supabase.from('account_events').insert({
      account_id,
      event_type: 'enriched',
      meta: {
        success: true,
        lookup_type: lookupType,
        allowed_to_operate: allowedToOperate,
        power_units: fmcsaData.totalPowerUnits,
        authorities: {
          common: commonAuthority,
          contract: contractAuthority,
          broker: brokerAuthority
        }
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        account_id,
        carrier_name: carrierName,
        allowed_to_operate: allowedToOperate,
        notes
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Enrichment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});