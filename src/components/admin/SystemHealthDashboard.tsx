import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Activity, 
  Phone, 
  Clock, 
  Webhook, 
  Truck, 
  PhoneCall,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Zap,
  Bot,
  Bell,
  History,
  TrendingUp,
  ShieldCheck,
  AlertOctagon,
  MessageSquare
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface ServiceStatus {
  status: string;
  last_at: string | null;
  error?: string;
  last_success?: string;
  last_fail?: string;
  fail_reason?: string;
  diagnosis?: string;
  uptime_24h?: number;
  uptime_7d?: number;
}

interface HealthData {
  overall_status: string;
  services: Record<string, ServiceStatus>;
  timestamp: string;
}

interface Incident {
  id: string;
  service: string;
  started_at: string;
  ended_at: string | null;
  duration_mins: number | null;
  reason: string;
  diagnosis: string;
  resolved: boolean;
}

type HealthStatus = "ok" | "warn" | "fail" | "unknown";

function getStatusColor(status: string): string {
  switch (status) {
    case "ok": return "text-emerald-600";
    case "warn": return "text-amber-500";
    case "fail": return "text-red-500";
    default: return "text-muted-foreground";
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case "ok": return "bg-emerald-500/10 border-emerald-500/30";
    case "warn": return "bg-amber-500/10 border-amber-500/30";
    case "fail": return "bg-red-500/10 border-red-500/30";
    default: return "bg-muted border-border";
  }
}

function getUptimeBadgeStyle(uptime: number | undefined): string {
  if (uptime === undefined) return "bg-muted text-muted-foreground";
  if (uptime >= 99) return "bg-emerald-500/20 text-emerald-700 border-emerald-500/30";
  if (uptime >= 95) return "bg-amber-500/20 text-amber-700 border-amber-500/30";
  return "bg-red-500/20 text-red-700 border-red-500/30";
}

function getFreshness(dateStr: string | null): { label: string; color: string } {
  if (!dateStr) return { label: "Never", color: "text-muted-foreground" };
  
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  
  if (mins < 5) return { label: `${mins}m ago`, color: "text-emerald-600" };
  if (mins < 30) return { label: `${mins}m ago`, color: "text-amber-500" };
  if (mins < 60) return { label: `${mins}m ago`, color: "text-red-500" };
  
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { label: `${hours}h ago`, color: hours < 6 ? "text-amber-500" : "text-red-500" };
  
  return { label: `${Math.floor(hours / 24)}d ago`, color: "text-red-500" };
}

function ServiceCard({ 
  name, 
  label, 
  icon: Icon, 
  data 
}: { 
  name: string; 
  label: string; 
  icon: React.ElementType; 
  data?: ServiceStatus;
}) {
  const status = data?.status || "unknown";
  const lastSuccess = getFreshness(data?.last_success || null);
  const lastFail = getFreshness(data?.last_fail || null);
  
  return (
    <div className={`rounded-xl border p-4 ${getStatusBg(status)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${getStatusColor(status)}`} />
          <span className="font-medium text-sm">{label}</span>
        </div>
        <Badge 
          variant={status === "ok" ? "default" : status === "warn" ? "secondary" : "destructive"}
          className="text-xs"
        >
          {status === "ok" ? "OK" : status === "warn" ? "WARN" : status === "fail" ? "FAIL" : "N/A"}
        </Badge>
      </div>
      
      {/* SLA Uptime Badges */}
      <div className="flex gap-2 mb-3">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getUptimeBadgeStyle(data?.uptime_24h)}`}>
          24h: {data?.uptime_24h !== undefined ? `${data.uptime_24h}%` : 'N/A'}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getUptimeBadgeStyle(data?.uptime_7d)}`}>
          7d: {data?.uptime_7d !== undefined ? `${data.uptime_7d}%` : 'N/A'}
        </span>
      </div>
      
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Success:</span>
          <span className={lastSuccess.color}>{lastSuccess.label}</span>
        </div>
        {data?.last_fail && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Fail:</span>
            <span className={lastFail.color}>{lastFail.label}</span>
          </div>
        )}
        {data?.diagnosis && status === "fail" && (
          <div className="mt-2 p-2 bg-red-500/10 rounded-lg border border-red-500/20">
            <p className="text-red-600 text-[10px] font-medium flex items-start gap-1">
              <AlertOctagon className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{data.diagnosis}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function IncidentTimeline({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
        <p className="text-sm">No incidents in the last 30 days</p>
      </div>
    );
  }

  const serviceLabels: Record<string, string> = {
    elevenlabs_calls: 'ElevenLabs Calls',
    elevenlabs_webhook: 'Webhook Processing',
    ai_assistant: 'AI Assistant',
    carrier_lookup: 'FMCSA Lookup',
    lead_scoring: 'Lead Scoring',
  };

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 pr-4">
        {incidents.map((incident) => (
          <div 
            key={incident.id} 
            className={`p-3 rounded-lg border ${incident.resolved ? 'bg-muted/50 border-border' : 'bg-red-500/10 border-red-500/30'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {incident.resolved ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
                )}
                <span className="font-medium text-sm">
                  {serviceLabels[incident.service] || incident.service}
                </span>
              </div>
              <Badge variant={incident.resolved ? "secondary" : "destructive"} className="text-xs">
                {incident.resolved ? 'Resolved' : 'Ongoing'}
              </Badge>
            </div>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Started:</span>
                <span>{format(new Date(incident.started_at), 'MMM d, h:mm a')}</span>
              </div>
              {incident.ended_at && (
                <div className="flex justify-between">
                  <span>Resolved:</span>
                  <span>{format(new Date(incident.ended_at), 'MMM d, h:mm a')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Duration:</span>
                <span>
                  {incident.duration_mins !== null 
                    ? incident.duration_mins < 60 
                      ? `${incident.duration_mins}m` 
                      : `${Math.floor(incident.duration_mins / 60)}h ${incident.duration_mins % 60}m`
                    : 'Ongoing'}
                </span>
              </div>
            </div>
            
            <div className="mt-2 p-2 bg-background/50 rounded text-xs">
              <p className="font-medium text-foreground mb-1">What broke:</p>
              <p className="text-muted-foreground">{incident.diagnosis}</p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function SystemHealthDashboard() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefreshCount, setAutoRefreshCount] = useState(30);
  const [sendingSms, setSendingSms] = useState(false);

  const fetchHealthStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('system-health', {
        body: { action: 'status' },
      });
      
      if (!error && data) {
        setHealthData(data);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Error fetching health status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('system-health', {
        body: { action: 'incidents' },
      });
      
      if (!error && data?.incidents) {
        setIncidents(data.incidents);
      }
    } catch (err) {
      console.error("Error fetching incidents:", err);
    }
  }, []);

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('system-health', {
        body: { action: 'check' },
      });
      
      if (!error) {
        // Refresh status after check
        await fetchHealthStatus();
        await fetchIncidents();
      }
    } catch (err) {
      console.error("Error running health check:", err);
    } finally {
    setChecking(false);
    }
  };

  const sendTestSms = async () => {
    setSendingSms(true);
    try {
      const { data, error } = await supabase.functions.invoke('system-health', {
        body: { action: 'test-sms' },
      });
      
      if (error) {
        toast.error('Failed to send test SMS: ' + error.message);
      } else if (data?.success) {
        toast.success('Test SMS sent successfully!');
      } else {
        toast.error(data?.error || 'Failed to send test SMS');
      }
    } catch (err) {
      console.error("Error sending test SMS:", err);
      toast.error('Failed to send test SMS');
    } finally {
      setSendingSms(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchHealthStatus();
    fetchIncidents();
  }, [fetchHealthStatus, fetchIncidents]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setAutoRefreshCount(prev => {
        if (prev <= 1) {
          fetchHealthStatus();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [fetchHealthStatus]);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const services = healthData?.services || {};
  const overallStatus = healthData?.overall_status || "unknown";

  // Calculate overall SLA
  const uptimeValues = Object.values(services)
    .map(s => s.uptime_24h)
    .filter((v): v is number => v !== undefined);
  const overallUptime24h = uptimeValues.length > 0 
    ? Math.round(uptimeValues.reduce((a, b) => a + b, 0) / uptimeValues.length)
    : undefined;

  const ongoingIncidents = incidents.filter(i => !i.resolved);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className={`h-5 w-5 ${getStatusColor(overallStatus)}`} />
              System Health
              <Badge 
                variant={overallStatus === "ok" ? "default" : overallStatus === "warn" ? "secondary" : "destructive"}
                className="ml-2"
              >
                {overallStatus === "ok" ? "ALL SYSTEMS OK" : overallStatus === "warn" ? "DEGRADED" : overallStatus === "fail" ? "OUTAGE" : "UNKNOWN"}
              </Badge>
              {overallUptime24h !== undefined && (
                <span className={`ml-2 text-sm font-normal px-2 py-0.5 rounded-full border ${getUptimeBadgeStyle(overallUptime24h)}`}>
                  {overallUptime24h}% uptime
                </span>
              )}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <span>Auto-refreshes in {autoRefreshCount}s</span>
              <span className="text-muted-foreground">·</span>
              <span>Last: {formatTime(lastRefresh.toISOString())}</span>
              {ongoingIncidents.length > 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-red-500 font-medium">{ongoingIncidents.length} ongoing incident(s)</span>
                </>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => { fetchHealthStatus(); fetchIncidents(); }} 
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={runHealthCheck} 
              disabled={checking}
              className="bg-primary"
            >
              {checking ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Check Now
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="status">
          <TabsList>
            <TabsTrigger value="status" className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              Status & SLA
            </TabsTrigger>
            <TabsTrigger value="incidents" className="flex items-center gap-1">
              <History className="h-4 w-4" />
              Incidents
              {ongoingIncidents.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {ongoingIncidents.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="status" className="mt-4 space-y-6">
            {/* Service Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ServiceCard 
                name="elevenlabs_calls" 
                label="ElevenLabs Calls" 
                icon={Phone} 
                data={services.elevenlabs_calls} 
              />
              <ServiceCard 
                name="elevenlabs_webhook" 
                label="Webhook Processing" 
                icon={Webhook} 
                data={services.elevenlabs_webhook} 
              />
              <ServiceCard 
                name="ai_assistant" 
                label="AI Assistant" 
                icon={Bot} 
                data={services.ai_assistant} 
              />
              <ServiceCard 
                name="carrier_lookup" 
                label="FMCSA Carrier Lookup" 
                icon={Truck} 
                data={services.carrier_lookup} 
              />
              <ServiceCard 
                name="lead_scoring" 
                label="Lead Scoring" 
                icon={PhoneCall} 
                data={services.lead_scoring} 
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
              <QuickStat label="Last Call" icon={PhoneCall} service={services.elevenlabs_calls} />
              <QuickStat label="Last Webhook" icon={Webhook} service={services.elevenlabs_webhook} />
              <QuickStat label="AI Heartbeat" icon={Bot} service={services.ai_assistant} />
              <QuickStat label="Carrier Check" icon={Truck} service={services.carrier_lookup} />
            </div>

            {/* Alert Status */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Alerts: SMS to +1 (202) 669-5354
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={sendTestSms}
                disabled={sendingSms}
                className="gap-2"
              >
                {sendingSms ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                Test SMS
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="incidents" className="mt-4">
            <IncidentTimeline incidents={incidents} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function QuickStat({ 
  label, 
  icon: Icon, 
  service 
}: { 
  label: string; 
  icon: React.ElementType; 
  service?: ServiceStatus;
}) {
  const lastAt = service?.last_success || service?.last_at;
  const freshness = getFreshness(lastAt || null);
  
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className={`text-xs ${freshness.color}`}>{freshness.label}</p>
      </div>
    </div>
  );
}