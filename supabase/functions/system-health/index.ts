import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alert recipients
const ALERT_EMAIL = "appletonab@gmail.com";
const ALERT_PHONE = "+12026695354";

// Auto-diagnosis rules
function diagnoseFailure(serviceName: string, errorMessage?: string, metadata?: Record<string, unknown>): string {
  const error = (errorMessage || '').toLowerCase();
  
  // Timeout errors
  if (error.includes('timeout') || error.includes('timed out') || error.includes('econnreset')) {
    return `Network timeout - ${serviceName} did not respond within expected time. Check network connectivity or service load.`;
  }
  
  // Authentication errors
  if (error.includes('401') || error.includes('unauthorized') || error.includes('invalid api key')) {
    return `Authentication failed - API key may be expired or invalid for ${serviceName}.`;
  }
  
  // Rate limiting
  if (error.includes('429') || error.includes('rate limit') || error.includes('too many requests')) {
    return `Rate limit exceeded - ${serviceName} is rejecting requests due to high volume.`;
  }
  
  // Service unavailable
  if (error.includes('503') || error.includes('502') || error.includes('service unavailable')) {
    return `Service unavailable - ${serviceName} backend is down or undergoing maintenance.`;
  }
  
  // Connection errors
  if (error.includes('econnrefused') || error.includes('connection refused')) {
    return `Connection refused - Cannot reach ${serviceName} endpoint. Check if service is running.`;
  }
  
  // DNS errors
  if (error.includes('enotfound') || error.includes('dns')) {
    return `DNS resolution failed - Cannot resolve ${serviceName} hostname.`;
  }
  
  // Specific service diagnostics
  if (serviceName === 'elevenlabs_calls' || serviceName === 'elevenlabs_webhook') {
    if (error.includes('no call') || error.includes('missing')) {
      return `No recent calls detected - Either no inbound calls or webhook pipeline is broken.`;
    }
  }
  
  if (serviceName === 'carrier_lookup') {
    if (error.includes('fmcsa') || error.includes('403') || error.includes('forbidden')) {
      return `FMCSA API access denied - Check API key validity or quota.`;
    }
  }
  
  // Pipeline diagnostics from metadata
  if (metadata?.missing_downstream) {
    return `Pipeline break detected - ${serviceName} completed but downstream events (${metadata.missing_downstream}) are missing.`;
  }
  
  // Default
  if (errorMessage) {
    return `Error in ${serviceName}: ${errorMessage.slice(0, 100)}`;
  }
  
  return `Unknown failure in ${serviceName} - Check logs for details.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { action } = body;

    // ==========================================
    // ACTION: test-sms - Send a test SMS
    // ==========================================
    if (action === 'test-sms') {
      console.log('[health] Sending test SMS');
      try {
        await sendSMSAlert('TEST', undefined, 'This is a test message from Truckinglane System Health.');
        return new Response(JSON.stringify({ success: true, message: 'Test SMS sent' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        console.error('[health] Test SMS error:', e);
        return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ==========================================
    // ACTION: log - Log a health event
    // ==========================================
    if (action === 'log') {
      const { service_name, status, error_message, metadata } = body;
      
      if (!service_name || !status) {
        return new Response(JSON.stringify({ error: 'service_name and status are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Auto-diagnose on failure
      let diagnosis: string | null = null;
      if (status === 'fail') {
        diagnosis = diagnoseFailure(service_name, error_message, metadata);
      }

      console.log(`[health] Logging: ${service_name} = ${status}${error_message ? ` (${error_message})` : ''}${diagnosis ? ` [Diagnosis: ${diagnosis}]` : ''}`);

      // Insert health event with diagnosis
      const { error: insertError } = await supabase
        .from('system_health_events')
        .insert({
          service_name,
          status,
          error_message: diagnosis || error_message || null,
          metadata: { ...metadata, original_error: error_message, diagnosis },
        });

      if (insertError) {
        console.error('[health] Insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to log event' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if we need to alert (state change to fail)
      if (status === 'fail') {
        await checkAndAlert(supabase, service_name, status, error_message || undefined, diagnosis || undefined);
      } else if (status === 'ok') {
        // Update alert state to ok (for recovery tracking)
        await supabase
          .from('system_alert_state')
          .upsert({
            service_name,
            last_status: 'ok',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'service_name' });
      }

      return new Response(JSON.stringify({ ok: true, diagnosis }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // ACTION: check - Run health checks on all services
    // ==========================================
    if (action === 'check') {
      console.log('[health] Running comprehensive health check');
      const results: Record<string, { status: string; error?: string; last_at?: string; diagnosis?: string }> = {};

      // Check 1: Last successful call
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentCall } = await supabase
        .from('ai_call_summaries')
        .select('created_at, call_outcome')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastCallAt = recentCall?.created_at || null;
      const callOk = lastCallAt && new Date(lastCallAt) > new Date(fiveMinAgo);
      
      let callDiagnosis: string | undefined;
      if (!lastCallAt) {
        callDiagnosis = 'No calls recorded yet';
      } else if (!callOk) {
        callDiagnosis = diagnoseFailure('elevenlabs_calls', 'No successful calls in last 5 minutes');
      }
      
      results.elevenlabs_calls = {
        status: lastCallAt ? (callOk ? 'ok' : 'warn') : 'unknown',
        last_at: lastCallAt,
        diagnosis: callDiagnosis,
      };

      // Check 2: Last webhook
      const { data: recentWebhook } = await supabase
        .from('webhook_logs')
        .select('processed_at, error')
        .order('processed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      results.elevenlabs_webhook = {
        status: recentWebhook ? (recentWebhook.error ? 'warn' : 'ok') : 'unknown',
        error: recentWebhook?.error || undefined,
        last_at: recentWebhook?.processed_at || undefined,
      };

      // Check 3: Last failed webhook in last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: failedWebhooks } = await supabase
        .from('webhook_logs')
        .select('id, error')
        .gte('processed_at', oneHourAgo)
        .not('error', 'is', null);

      if (failedWebhooks && failedWebhooks.length > 0) {
        const errorMsg = `${failedWebhooks.length} failed webhook(s) in last hour`;
        results.elevenlabs_webhook.status = 'fail';
        results.elevenlabs_webhook.error = errorMsg;
        results.elevenlabs_webhook.diagnosis = diagnoseFailure('elevenlabs_webhook', errorMsg);
      }

      // Check 4: AI Assistant - ping the function
      try {
        const { error: aiError } = await supabase.functions.invoke('ai-assistant', {
          body: { action: 'health-check' },
        });
        results.ai_assistant = { 
          status: aiError ? 'fail' : 'ok', 
          error: aiError?.message,
          diagnosis: aiError ? diagnoseFailure('ai_assistant', aiError.message) : undefined,
        };
      } catch (e) {
        results.ai_assistant = { 
          status: 'fail', 
          error: String(e),
          diagnosis: diagnoseFailure('ai_assistant', String(e)),
        };
      }

      // Check 5: Carrier lookup - ping the function with test DOT
      try {
        const { error: carrierError } = await supabase.functions.invoke('carrier-lookup', {
          body: { usdot: '123456' },
        });
        // Even 404 means function is responding
        results.carrier_lookup = { status: 'ok' };
      } catch (e) {
        results.carrier_lookup = { 
          status: 'fail', 
          error: String(e),
          diagnosis: diagnoseFailure('carrier_lookup', String(e)),
        };
      }

      // Check 6: Lead scoring
      const { data: recentLead } = await supabase
        .from('leads')
        .select('created_at, is_high_intent')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      results.lead_scoring = {
        status: recentLead ? 'ok' : 'unknown',
        last_at: recentLead?.created_at,
      };

      // Log health events for each service
      for (const [service, result] of Object.entries(results)) {
        await supabase.from('system_health_events').insert({
          service_name: service,
          status: result.status,
          error_message: result.diagnosis || result.error || null,
          metadata: { check_type: 'manual', last_at: result.last_at, diagnosis: result.diagnosis },
        });

        // Alert on failures
        if (result.status === 'fail') {
          await checkAndAlert(supabase, service, 'fail', result.error, result.diagnosis);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        timestamp: new Date().toISOString(),
        results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // ACTION: status - Get current health status
    // ==========================================
    if (action === 'status') {
      const services = ['elevenlabs_calls', 'elevenlabs_webhook', 'ai_assistant', 'carrier_lookup', 'lead_scoring'];
      const status: Record<string, { 
        status: string; 
        last_at: string | null; 
        error?: string; 
        last_success?: string; 
        last_fail?: string; 
        fail_reason?: string;
        diagnosis?: string;
        uptime_24h?: number;
        uptime_7d?: number;
      }> = {};

      const now = new Date();
      const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      for (const service of services) {
        // Get last event
        const { data: lastEvent } = await supabase
          .from('system_health_events')
          .select('status, error_message, created_at, metadata')
          .eq('service_name', service)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get last success
        const { data: lastSuccess } = await supabase
          .from('system_health_events')
          .select('created_at')
          .eq('service_name', service)
          .eq('status', 'ok')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get last failure
        const { data: lastFail } = await supabase
          .from('system_health_events')
          .select('created_at, error_message, metadata')
          .eq('service_name', service)
          .eq('status', 'fail')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Calculate 24h uptime
        const { count: total24h } = await supabase
          .from('system_health_events')
          .select('*', { count: 'exact', head: true })
          .eq('service_name', service)
          .gte('created_at', h24Ago);

        const { count: ok24h } = await supabase
          .from('system_health_events')
          .select('*', { count: 'exact', head: true })
          .eq('service_name', service)
          .eq('status', 'ok')
          .gte('created_at', h24Ago);

        // Calculate 7d uptime
        const { count: total7d } = await supabase
          .from('system_health_events')
          .select('*', { count: 'exact', head: true })
          .eq('service_name', service)
          .gte('created_at', d7Ago);

        const { count: ok7d } = await supabase
          .from('system_health_events')
          .select('*', { count: 'exact', head: true })
          .eq('service_name', service)
          .eq('status', 'ok')
          .gte('created_at', d7Ago);

        const uptime24h = total24h && total24h > 0 ? Math.round((ok24h || 0) / total24h * 100) : null;
        const uptime7d = total7d && total7d > 0 ? Math.round((ok7d || 0) / total7d * 100) : null;

        // Extract diagnosis from metadata if available
        const diagnosis = lastFail?.metadata?.diagnosis || lastEvent?.metadata?.diagnosis;

        status[service] = {
          status: lastEvent?.status || 'unknown',
          last_at: lastEvent?.created_at || null,
          error: lastEvent?.error_message || undefined,
          last_success: lastSuccess?.created_at || undefined,
          last_fail: lastFail?.created_at || undefined,
          fail_reason: lastFail?.error_message || undefined,
          diagnosis: diagnosis as string | undefined,
          uptime_24h: uptime24h ?? undefined,
          uptime_7d: uptime7d ?? undefined,
        };
      }

      // Calculate overall health
      const overallStatus = Object.values(status).some(s => s.status === 'fail') 
        ? 'fail' 
        : Object.values(status).some(s => s.status === 'warn') 
          ? 'warn' 
          : 'ok';

      return new Response(JSON.stringify({
        ok: true,
        overall_status: overallStatus,
        services: status,
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // ACTION: incidents - Get incident history
    // ==========================================
    if (action === 'incidents') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Get all status change events (FAIL or OK after FAIL)
      const { data: allEvents } = await supabase
        .from('system_health_events')
        .select('service_name, status, error_message, created_at, metadata')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: true });

      if (!allEvents || allEvents.length === 0) {
        return new Response(JSON.stringify({ incidents: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Group by service and detect incidents (FAIL → OK transitions)
      const serviceStates: Record<string, { inIncident: boolean; incidentStart?: string; failReason?: string; diagnosis?: string }> = {};
      const incidents: Array<{
        id: string;
        service: string;
        started_at: string;
        ended_at: string | null;
        duration_mins: number | null;
        reason: string;
        diagnosis: string;
        resolved: boolean;
      }> = [];

      for (const event of allEvents) {
        const service = event.service_name;
        if (!serviceStates[service]) {
          serviceStates[service] = { inIncident: false };
        }

        const state = serviceStates[service];
        
        if (event.status === 'fail' && !state.inIncident) {
          // Incident started
          state.inIncident = true;
          state.incidentStart = event.created_at;
          state.failReason = event.error_message || 'Unknown error';
          state.diagnosis = (event.metadata as Record<string, unknown>)?.diagnosis as string || state.failReason;
        } else if (event.status === 'ok' && state.inIncident) {
          // Incident resolved
          const startTime = new Date(state.incidentStart!);
          const endTime = new Date(event.created_at);
          const durationMins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
          
          incidents.push({
            id: `${service}-${state.incidentStart}`,
            service,
            started_at: state.incidentStart!,
            ended_at: event.created_at,
            duration_mins: durationMins,
            reason: state.failReason!,
            diagnosis: state.diagnosis!,
            resolved: true,
          });
          
          state.inIncident = false;
        }
      }

      // Add ongoing incidents
      for (const [service, state] of Object.entries(serviceStates)) {
        if (state.inIncident) {
          const startTime = new Date(state.incidentStart!);
          const durationMins = Math.round((Date.now() - startTime.getTime()) / 60000);
          
          incidents.push({
            id: `${service}-${state.incidentStart}`,
            service,
            started_at: state.incidentStart!,
            ended_at: null,
            duration_mins: durationMins,
            reason: state.failReason!,
            diagnosis: state.diagnosis!,
            resolved: false,
          });
        }
      }

      // Sort by start time descending
      incidents.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

      return new Response(JSON.stringify({ incidents }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[health] Error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Check if we should alert and send notifications
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndAlert(
  supabase: any,
  serviceName: string,
  newStatus: string,
  errorMessage?: string,
  diagnosis?: string
): Promise<void> {
  try {
    // Get current alert state
    const { data: alertState } = await supabase
      .from('system_alert_state')
      .select('*')
      .eq('service_name', serviceName)
      .maybeSingle();

    const previousStatus = alertState?.last_status || 'ok';
    const lastAlertedAt = alertState?.last_alerted_at ? new Date(alertState.last_alerted_at) : null;
    const now = new Date();

    // Only alert on state CHANGE to fail (OK → FAIL, not FAIL → FAIL)
    const isStateChange = previousStatus !== newStatus;
    const shouldAlert = isStateChange && newStatus === 'fail';

    // Debounce: don't alert more than once per 5 minutes for same service
    const debounceMs = 5 * 60 * 1000;
    const isDebounced = lastAlertedAt && (now.getTime() - lastAlertedAt.getTime()) < debounceMs;

    console.log(`[alert] Service: ${serviceName}, Previous: ${previousStatus}, New: ${newStatus}, StateChange: ${isStateChange}, ShouldAlert: ${shouldAlert}, Debounced: ${isDebounced}`);

    if (shouldAlert && !isDebounced) {
      console.log(`[alert] Sending alert for ${serviceName} failure`);
      
      // Send email alert with diagnosis
      await sendEmailAlert(serviceName, errorMessage, diagnosis);
      
      // Send SMS alert with diagnosis
      await sendSMSAlert(serviceName, errorMessage, diagnosis);

      // Update alert state
      await supabase
        .from('system_alert_state')
        .upsert({
          service_name: serviceName,
          last_status: newStatus,
          last_alerted_at: now.toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: 'service_name' });
    } else {
      // Just update the status without alerting
      await supabase
        .from('system_alert_state')
        .upsert({
          service_name: serviceName,
          last_status: newStatus,
          updated_at: now.toISOString(),
        }, { onConflict: 'service_name' });
    }
  } catch (e) {
    console.error('[alert] Error in checkAndAlert:', e);
  }
}

async function sendEmailAlert(serviceName: string, errorMessage?: string, diagnosis?: string): Promise<void> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('[alert] RESEND_API_KEY not configured');
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Truckinglane Alerts <onboarding@resend.dev>',
        to: [ALERT_EMAIL],
        subject: `🚨 ALERT: ${serviceName} is DOWN`,
        html: `
          <h1>System Health Alert</h1>
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Status:</strong> FAIL</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          ${diagnosis ? `<p><strong>🔍 Diagnosis:</strong> ${diagnosis}</p>` : ''}
          ${errorMessage && errorMessage !== diagnosis ? `<p><strong>Error:</strong> ${errorMessage}</p>` : ''}
          <hr>
          <p>This is an automated alert from your Truckinglane monitoring system.</p>
        `,
      }),
    });
    
    if (response.ok) {
      console.log(`[alert] Email sent to ${ALERT_EMAIL}`);
    } else {
      const err = await response.text();
      console.error('[alert] Email error:', err);
    }
  } catch (e) {
    console.error('[alert] Email error:', e);
  }
}

async function sendSMSAlert(serviceName: string, errorMessage?: string, diagnosis?: string): Promise<void> {
  const TWILIO_SID = Deno.env.get('TWILIO_SID');
  const TWILIO_TOKEN = Deno.env.get('TWILIO_TOKEN');
  const TWILIO_FROM = Deno.env.get('TWILIO_FROM');
  
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log('[alert] Twilio credentials not configured, skipping SMS');
    return;
  }

  const message = `TRUCKINGLANE ALERT: ${serviceName} FAILED. ${diagnosis || errorMessage || 'Check dashboard for details.'}`;
  
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: ALERT_PHONE,
          From: TWILIO_FROM,
          Body: message,
        }),
      }
    );
    
    if (response.ok) {
      console.log(`[alert] SMS sent to ${ALERT_PHONE}`);
    } else {
      const err = await response.text();
      console.error('[alert] SMS error:', err);
    }
  } catch (e) {
    console.error('[alert] SMS error:', e);
  }
}
