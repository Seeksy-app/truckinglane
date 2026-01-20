import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckResult {
  service: string;
  status: 'ok' | 'warn' | 'fail' | 'disabled';
  message: string;
  latency_ms: number;
  meta: Record<string, unknown>;
}

const LATENCY_THRESHOLDS = {
  database: { ok: 300, warn: 1000 },
  auth: { ok: 500, warn: 1500 },
  storage: { ok: 500, warn: 1500 },
  edge_functions: { ok: 1000, warn: 3000 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkDatabase(supabase: any): Promise<CheckResult> {
  const start = performance.now();
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    const latency = Math.round(performance.now() - start);
    
    if (error) {
      return { service: 'database', status: 'fail', message: 'Query failed', latency_ms: latency, meta: { error: error.message } };
    }
    
    const thresholds = LATENCY_THRESHOLDS.database;
    const status = latency <= thresholds.ok ? 'ok' : latency <= thresholds.warn ? 'warn' : 'fail';
    return { service: 'database', status, message: status === 'ok' ? 'Healthy' : `High latency: ${latency}ms`, latency_ms: latency, meta: {} };
  } catch (e) {
    return { service: 'database', status: 'fail', message: 'Connection failed', latency_ms: Math.round(performance.now() - start), meta: { error: String(e) } };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAuth(supabase: any): Promise<CheckResult> {
  const start = performance.now();
  try {
    // Test auth by getting settings (admin-level check)
    const { error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    const latency = Math.round(performance.now() - start);
    
    if (error) {
      return { service: 'auth', status: 'fail', message: 'Auth check failed', latency_ms: latency, meta: {} };
    }
    
    const thresholds = LATENCY_THRESHOLDS.auth;
    const status = latency <= thresholds.ok ? 'ok' : latency <= thresholds.warn ? 'warn' : 'fail';
    return { service: 'auth', status, message: status === 'ok' ? 'Healthy' : `High latency: ${latency}ms`, latency_ms: latency, meta: {} };
  } catch (e) {
    return { service: 'auth', status: 'fail', message: 'Auth service error', latency_ms: Math.round(performance.now() - start), meta: {} };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkStorage(supabase: any): Promise<CheckResult> {
  const start = performance.now();
  try {
    const { error } = await supabase.storage.listBuckets();
    const latency = Math.round(performance.now() - start);
    
    if (error) {
      // Storage might not have buckets - that's ok
      if (error.message?.includes('not found')) {
        return { service: 'storage', status: 'ok', message: 'No buckets configured', latency_ms: latency, meta: {} };
      }
      return { service: 'storage', status: 'warn', message: 'Storage query issue', latency_ms: latency, meta: {} };
    }
    
    const thresholds = LATENCY_THRESHOLDS.storage;
    const status = latency <= thresholds.ok ? 'ok' : latency <= thresholds.warn ? 'warn' : 'fail';
    return { service: 'storage', status, message: status === 'ok' ? 'Healthy' : `High latency: ${latency}ms`, latency_ms: latency, meta: {} };
  } catch (e) {
    return { service: 'storage', status: 'fail', message: 'Storage error', latency_ms: Math.round(performance.now() - start), meta: {} };
  }
}

async function checkEdgeFunction(baseUrl: string, functionName: string): Promise<CheckResult> {
  const start = performance.now();
  const serviceName = functionName.replace(/-/g, '_');
  
  try {
    const response = await fetch(`${baseUrl}/functions/v1/${functionName}?health=true`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const latency = Math.round(performance.now() - start);
    
    if (!response.ok) {
      return { service: serviceName, status: 'fail', message: `HTTP ${response.status}`, latency_ms: latency, meta: {} };
    }
    
    const thresholds = LATENCY_THRESHOLDS.edge_functions;
    const status = latency <= thresholds.ok ? 'ok' : latency <= thresholds.warn ? 'warn' : 'fail';
    return { service: serviceName, status, message: status === 'ok' ? 'Healthy' : `Slow: ${latency}ms`, latency_ms: latency, meta: {} };
  } catch (e) {
    return { service: serviceName, status: 'fail', message: 'Unreachable', latency_ms: Math.round(performance.now() - start), meta: {} };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkWebhookProcessing(supabase: any): Promise<CheckResult> {
  const start = performance.now();
  try {
    // Check last successful webhook
    const { data: lastWebhook, error } = await supabase
      .from('webhook_logs')
      .select('processed_at, error')
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const latency = Math.round(performance.now() - start);
    
    if (error) {
      return { service: 'webhook_processing', status: 'warn', message: 'Could not check', latency_ms: latency, meta: {} };
    }
    
    if (!lastWebhook) {
      return { service: 'webhook_processing', status: 'ok', message: 'No webhooks yet', latency_ms: latency, meta: {} };
    }

    const webhookData = lastWebhook as { processed_at: string; error: string | null };
    const lastProcessed = new Date(webhookData.processed_at);
    const minutesAgo = (Date.now() - lastProcessed.getTime()) / (1000 * 60);
    
    if (webhookData.error) {
      return { service: 'webhook_processing', status: 'warn', message: 'Last webhook had error', latency_ms: latency, meta: { minutes_ago: Math.round(minutesAgo) } };
    }
    
    if (minutesAgo > 60) {
      return { service: 'webhook_processing', status: 'ok', message: 'Idle (no recent activity)', latency_ms: latency, meta: { minutes_ago: Math.round(minutesAgo) } };
    }
    
    return { service: 'webhook_processing', status: 'ok', message: 'Processing', latency_ms: latency, meta: { minutes_ago: Math.round(minutesAgo) } };
  } catch (e) {
    return { service: 'webhook_processing', status: 'fail', message: 'Check failed', latency_ms: Math.round(performance.now() - start), meta: {} };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkCalls(supabase: any): Promise<CheckResult> {
  const start = performance.now();
  try {
    // Check last call
    const { data: lastCall, error } = await supabase
      .from('phone_calls')
      .select('created_at, call_status')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const latency = Math.round(performance.now() - start);
    
    if (error) {
      return { service: 'calls', status: 'warn', message: 'Could not check', latency_ms: latency, meta: {} };
    }
    
    if (!lastCall) {
      return { service: 'calls', status: 'ok', message: 'No calls yet', latency_ms: latency, meta: {} };
    }

    const callData = lastCall as { created_at: string; call_status: string };
    const lastCallTime = new Date(callData.created_at);
    const minutesAgo = (Date.now() - lastCallTime.getTime()) / (1000 * 60);
    
    if (callData.call_status === 'failed' && minutesAgo < 5) {
      return { service: 'calls', status: 'warn', message: 'Recent call failed', latency_ms: latency, meta: { minutes_ago: Math.round(minutesAgo) } };
    }
    
    return { service: 'calls', status: 'ok', message: 'Operational', latency_ms: latency, meta: { minutes_ago: Math.round(minutesAgo) } };
  } catch (e) {
    return { service: 'calls', status: 'fail', message: 'Check failed', latency_ms: Math.round(performance.now() - start), meta: {} };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint for this function itself
  const url = new URL(req.url);
  if (url.pathname.endsWith('/health') || url.searchParams.get('health') === 'true') {
    return new Response(JSON.stringify({ status: 'ok', service: 'health-check-runner', timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[health-check] Starting health checks...');

    // Run all checks in parallel
    const [database, auth, storage, aiAssistant, carrierLookup, webhookProcessing, calls] = await Promise.all([
      checkDatabase(supabase),
      checkAuth(supabase),
      checkStorage(supabase),
      checkEdgeFunction(supabaseUrl, 'ai-assistant'),
      checkEdgeFunction(supabaseUrl, 'carrier-lookup'),
      checkWebhookProcessing(supabase),
      checkCalls(supabase),
    ]);

    const results: CheckResult[] = [database, auth, storage, aiAssistant, carrierLookup, webhookProcessing, calls];

    console.log('[health-check] Check results:', results.map(r => `${r.service}: ${r.status}`).join(', '));

    // Insert all results into status_checks
    const inserts = results.map(r => ({
      service: r.service,
      status: r.status,
      message: r.message,
      meta: r.meta,
      latency_ms: r.latency_ms,
      checked_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase.from('status_checks').insert(inserts);
    
    if (insertError) {
      console.error('[health-check] Failed to insert results:', insertError);
    }

    // Determine overall status
    const hasFailure = results.some(r => r.status === 'fail');
    const hasWarning = results.some(r => r.status === 'warn');
    const overallStatus = hasFailure ? 'fail' : hasWarning ? 'warn' : 'ok';

    return new Response(JSON.stringify({
      ok: true,
      overall_status: overallStatus,
      checks: results,
      checked_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[health-check] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
