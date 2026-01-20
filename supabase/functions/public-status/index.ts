import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceStatus {
  service: string;
  status: 'ok' | 'warn' | 'fail' | 'disabled';
  message: string;
  latency_ms: number | null;
  checked_at: string;
}

interface Incident {
  id: string;
  service: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  title: string;
  description: string | null;
  started_at: string;
  resolved_at: string | null;
}

interface UptimeStats {
  period: string;
  total_checks: number;
  ok_checks: number;
  uptime_percentage: number;
}

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get latest status per service (last 1 hour of checks to ensure fresh data)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: latestChecks } = await supabase
      .from('status_checks')
      .select('service, status, message, latency_ms, checked_at')
      .gte('checked_at', oneHourAgo)
      .order('checked_at', { ascending: false });

    // Deduplicate to get latest per service
    const serviceMap = new Map<string, ServiceStatus>();
    for (const check of latestChecks || []) {
      if (!serviceMap.has(check.service)) {
        serviceMap.set(check.service, {
          service: check.service,
          status: check.status,
          message: check.message,
          latency_ms: check.latency_ms,
          checked_at: check.checked_at,
        });
      }
    }
    const services: ServiceStatus[] = Array.from(serviceMap.values());

    // Get active incidents (not resolved in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: incidents } = await supabase
      .from('status_incidents')
      .select('id, service, severity, status, title, description, started_at, resolved_at')
      .or(`resolved_at.is.null,resolved_at.gte.${thirtyDaysAgo}`)
      .order('started_at', { ascending: false })
      .limit(20);

    // Calculate uptime percentages
    const uptimeStats: UptimeStats[] = [];
    
    for (const period of ['24h', '7d', '30d']) {
      let hoursBack = 24;
      if (period === '7d') hoursBack = 24 * 7;
      if (period === '30d') hoursBack = 24 * 30;
      
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
      
      const { data: periodChecks } = await supabase
        .from('status_checks')
        .select('status')
        .gte('checked_at', since)
        .neq('status', 'disabled');
      
      const total = periodChecks?.length || 0;
      const okCount = periodChecks?.filter(c => c.status === 'ok').length || 0;
      const uptime = total > 0 ? Math.round((okCount / total) * 10000) / 100 : 100;
      
      uptimeStats.push({
        period,
        total_checks: total,
        ok_checks: okCount,
        uptime_percentage: uptime,
      });
    }

    // Determine overall status
    const hasFailure = services.some(s => s.status === 'fail');
    const hasWarning = services.some(s => s.status === 'warn');
    const activeIncident = (incidents || []).find(i => i.status !== 'resolved');
    
    let overallStatus: 'operational' | 'degraded' | 'outage' = 'operational';
    if (hasFailure || activeIncident?.severity === 'critical') {
      overallStatus = 'outage';
    } else if (hasWarning || activeIncident) {
      overallStatus = 'degraded';
    }

    // Build "what broke" diagnosis if there are failures
    let diagnosis: string | null = null;
    const failedServices = services.filter(s => s.status === 'fail');
    if (failedServices.length > 0) {
      const failedNames = failedServices.map(s => s.service.replace(/_/g, ' ')).join(', ');
      diagnosis = `Issues detected with: ${failedNames}. `;
      
      // Check for cascading failures
      if (failedServices.some(s => s.service === 'database')) {
        diagnosis += 'Database connectivity issue may be affecting other services.';
      } else if (failedServices.some(s => s.service === 'auth')) {
        diagnosis += 'Authentication service issue detected.';
      } else {
        diagnosis += 'Our team is investigating.';
      }
    }

    const response = {
      overall_status: overallStatus,
      services,
      incidents: (incidents || []).map((i: Incident) => ({
        id: i.id,
        service: i.service,
        severity: i.severity,
        status: i.status,
        title: i.title,
        description: i.description,
        started_at: i.started_at,
        resolved_at: i.resolved_at,
      })),
      uptime: uptimeStats,
      diagnosis,
      last_updated: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute
      },
    });
  } catch (e) {
    console.error('[public-status] Error:', e);
    return new Response(JSON.stringify({ 
      overall_status: 'operational',
      services: [],
      incidents: [],
      uptime: [],
      diagnosis: null,
      last_updated: new Date().toISOString(),
      error: 'Could not fetch status',
    }), {
      status: 200, // Return 200 even on error to not break status pages
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
