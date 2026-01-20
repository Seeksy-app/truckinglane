import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Clock, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LeadGenLayout } from "@/components/leadgen/LeadGenLayout";

interface ServiceStatus {
  service: string;
  status: 'ok' | 'warn' | 'fail' | 'disabled';
  message: string;
  latency_ms: number | null;
  checked_at: string;
}

interface UptimeStats {
  period: string;
  uptime_percentage: number;
}

interface StatusData {
  overall_status: 'operational' | 'degraded' | 'outage';
  services: ServiceStatus[];
  uptime: UptimeStats[];
  diagnosis: string | null;
  last_updated: string;
}

const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  database: "Database",
  auth: "Authentication",
  storage: "File Storage",
  ai_assistant: "AI Assistant",
  carrier_lookup: "Carrier Lookup",
  webhook_processing: "Webhooks",
  calls: "Phone Calls",
};

export default function Status() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const { data: response, error } = await supabase.functions.invoke('public-status');
      if (!error && response) {
        setData(response);
      }
    } catch (e) {
      console.error("Failed to fetch status:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warn': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'fail': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getOverallBadge = () => {
    if (!data) return null;
    const colors = {
      operational: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
      degraded: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
      outage: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
    };
    const labels = { operational: "All Systems Operational", degraded: "Degraded Performance", outage: "Service Outage" };
    return (
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${colors[data.overall_status]}`}>
        {data.overall_status === 'operational' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        <span className="font-semibold">{labels[data.overall_status]}</span>
      </div>
    );
  };

  return (
    <LeadGenLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">System Status</h1>
            <p className="text-muted-foreground mt-1">Live service health and incident updates</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={fetchStatus} className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {getOverallBadge()}
          </div>
        </div>

        {/* Uptime Cards */}
        {data?.uptime && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {data.uptime.map((u) => (
              <div key={u.period} className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold">{u.uptime_percentage}%</p>
                <p className="text-sm text-muted-foreground">{u.period} uptime</p>
              </div>
            ))}
          </div>
        )}

        {/* Diagnosis */}
        {data?.diagnosis && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-8">
            <p className="text-destructive">{data.diagnosis}</p>
          </div>
        )}

        {/* Services Grid */}
        <div className="space-y-3 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" /> Services
          </h2>
          {data?.services.map((service) => (
            <div key={service.service} className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                {getStatusIcon(service.status)}
                <span className="font-medium">{SERVICE_DISPLAY_NAMES[service.service] || service.service}</span>
              </div>
              <div className="flex items-center gap-4">
                {service.latency_ms && <span className="text-muted-foreground text-sm">{service.latency_ms}ms</span>}
                <span className="text-muted-foreground text-sm">{service.message}</span>
              </div>
            </div>
          ))}
          {(!data?.services || data.services.length === 0) && (
            <p className="text-muted-foreground text-center py-8">No status checks yet. Run a health check from the admin dashboard.</p>
          )}
        </div>

        <p className="text-center text-muted-foreground text-sm">
          Last updated: {data?.last_updated ? new Date(data.last_updated).toLocaleString() : 'Loading...'}
        </p>
      </div>
    </LeadGenLayout>
  );
}
