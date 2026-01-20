import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, Users, Package, ArrowRight, CheckCircle, Phone, Target, 
  PhoneOff, Info, AlertTriangle, Clock, Zap, Gauge, Flame
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  calculateAnalyticsMetrics, 
  METRIC_TOOLTIPS,
  ENGAGED_THRESHOLD_SECS,
  QUICK_HANGUP_THRESHOLD_SECS,
  type CallRecord,
  type LeadRecord,
  type LoadRecord,
} from "@/lib/analyticsLogic";
import { ExpandableKPICard, ExpandedListPanel, type ExpandableItem } from "./ExpandableKPICard";
import { type AnalyticsKPIs, formatCallbackSpeed } from "@/hooks/useCanonicalMetrics";

interface ElevenLabsCall {
  id: string;
  created_at: string;
  call_duration_secs: number | null;
  status: string | null;
  termination_reason: string | null;
  call_summary_title: string | null;
  transcript_summary: string | null;
  external_number: string | null;
  conversation_id: string | null;
  is_high_intent?: boolean | null;
  payload: unknown;
}

interface LeadData {
  id: string;
  status: string;
  created_at: string;
  booked_at: string | null;
  closed_at: string | null;
  is_high_intent?: boolean | null;
  intent_score?: number | null;
  phone_call_id?: string | null;
  caller_phone?: string;
  caller_company?: string | null;
  caller_name?: string | null;
}

interface GeneralTabProps {
  loads: Array<{
    id: string;
    status: string;
    pickup_city: string | null;
    pickup_state: string | null;
    dest_city: string | null;
    dest_state: string | null;
    created_at: string;
    is_active: boolean;
    booked_at?: string | null;
    booked_source?: string | null;
  }>;
  leads: LeadData[];
  calls: Array<{
    id: string;
    created_at: string;
    duration_seconds?: number | null;
  }>;
  elevenLabsCalls?: ElevenLabsCall[];
  aiBookings?: Array<{
    id: string;
    booked_at: string | null;
  }>;
  kpis?: AnalyticsKPIs | null;
  kpisLoading?: boolean;
}

// Constants are now imported from analyticsLogic.ts

// Simple KPI Card (non-expandable)
const KPICard = ({ 
  label, 
  value, 
  subtext, 
  icon: Icon, 
  color,
  tooltip,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  color: string;
  tooltip: string;
}) => {
  const colorClasses: Record<string, string> = {
    blue: "text-blue-500 bg-blue-500/10",
    emerald: "text-emerald-500 bg-emerald-500/10",
    amber: "text-amber-500 bg-amber-500/10",
    purple: "text-purple-500 bg-purple-500/10",
    slate: "text-slate-500 bg-slate-500/10",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="bg-card border border-border">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-muted-foreground mb-1 truncate">
                    {label}
                  </p>
                  <Info className="h-3 w-3 text-muted-foreground/50" />
                </div>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {value}
                </p>
                {subtext && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {subtext}
                  </p>
                )}
              </div>
              <div className={`p-2 rounded-lg ${colorClasses[color] || "text-muted-foreground bg-muted/50"}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
};


export const GeneralTab = ({ loads, leads, calls, elevenLabsCalls = [], aiBookings = [], kpis, kpisLoading }: GeneralTabProps) => {
  const navigate = useNavigate();
  const useElevenLabs = elevenLabsCalls.length > 0;
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Use canonical analytics logic
  const stats = useMemo(() => {
    // Normalize call records to CallRecord format
    const normalizedCalls: CallRecord[] = useElevenLabs 
      ? elevenLabsCalls.map(c => ({
          id: c.id,
          created_at: c.created_at,
          call_duration_secs: c.call_duration_secs,
          is_high_intent: c.is_high_intent,
          conversation_id: c.conversation_id,
        }))
      : calls.map(c => ({
          id: c.id,
          created_at: c.created_at,
          duration_seconds: c.duration_seconds,
        }));
    
    const normalizedLeads: LeadRecord[] = leads.map(l => ({
      id: l.id,
      status: l.status,
      created_at: l.created_at,
      is_high_intent: l.is_high_intent,
      intent_score: l.intent_score,
      phone_call_id: l.phone_call_id,
      booked_at: l.booked_at,
      closed_at: l.closed_at,
    }));
    
    const normalizedLoads: LoadRecord[] = loads.map(l => ({
      id: l.id,
      status: l.status,
      is_active: l.is_active,
      created_at: l.created_at,
      booked_at: l.booked_at,
      booked_source: l.booked_source,
    }));
    
    // Calculate engaged and quick hangup lists
    const engagedCallsList: ElevenLabsCall[] = [];
    const quickHangupsList: ElevenLabsCall[] = [];
    
    if (useElevenLabs) {
      elevenLabsCalls.forEach(c => {
        const duration = c.call_duration_secs || 0;
        const isEngaged = duration >= ENGAGED_THRESHOLD_SECS || c.is_high_intent;
        
        if (isEngaged) {
          engagedCallsList.push(c);
        }
        
        if (duration < QUICK_HANGUP_THRESHOLD_SECS) {
          quickHangupsList.push(c);
        }
      });
    }
    
    const totalLeadCount = leads.length;
    const finalEngagedCount = Math.max(engagedCallsList.length, totalLeadCount);
    
    const metrics = calculateAnalyticsMetrics(normalizedCalls, normalizedLeads, normalizedLoads);

    return {
      ...metrics,
      engagedCalls: engagedCallsList,
      quickHangups: quickHangupsList,
      conversionRate: metrics.callToBookedRate.toFixed(1),
      leadToBookedRate: metrics.leadToBookedRate,
      engagedCount: finalEngagedCount,
    };
  }, [loads, leads, calls, elevenLabsCalls, useElevenLabs]);

  // Transform data for expandable cards
  const callItems: ExpandableItem[] = useMemo(() => {
    return elevenLabsCalls.slice(0, 50).map(c => ({
      type: "call" as const,
      id: c.id,
      created_at: c.created_at,
      external_number: c.external_number,
      call_duration_secs: c.call_duration_secs,
      call_summary_title: c.call_summary_title,
      status: c.status,
      is_high_intent: c.is_high_intent,
    }));
  }, [elevenLabsCalls]);

  const engagedCallItems: ExpandableItem[] = useMemo(() => {
    return stats.engagedCalls.slice(0, 50).map(c => ({
      type: "call" as const,
      id: c.id,
      created_at: c.created_at,
      external_number: c.external_number,
      call_duration_secs: c.call_duration_secs,
      call_summary_title: c.call_summary_title,
      status: c.status,
      is_high_intent: c.is_high_intent,
    }));
  }, [stats.engagedCalls]);

  const quickHangupItems: ExpandableItem[] = useMemo(() => {
    return stats.quickHangups.slice(0, 50).map(c => ({
      type: "call" as const,
      id: c.id,
      created_at: c.created_at,
      external_number: c.external_number,
      call_duration_secs: c.call_duration_secs,
      call_summary_title: c.call_summary_title,
      status: c.status,
      is_high_intent: c.is_high_intent,
    }));
  }, [stats.quickHangups]);

  const leadItems: ExpandableItem[] = useMemo(() => {
    return leads.slice(0, 50).map(l => ({
      type: "lead" as const,
      id: l.id,
      created_at: l.created_at,
      caller_phone: l.caller_phone || "Unknown",
      caller_company: l.caller_company,
      status: l.status,
      is_high_intent: l.is_high_intent,
      intent_score: l.intent_score,
    }));
  }, [leads]);

  // Navigation handlers
  const handleLeadClick = (item: ExpandableItem) => {
    if (item.type === "lead") {
      navigate(`/dashboard?lead=${encodeURIComponent(item.caller_phone)}`);
    }
  };

  const handleCallClick = (item: ExpandableItem) => {
    if (item.type === "call" && item.external_number) {
      navigate(`/dashboard?lead=${encodeURIComponent(item.external_number)}`);
    }
  };

  // Activity over time
  const activityOverTime = useMemo(() => {
    const dateMap = new Map<string, { date: string; calls: number; leads: number; booked: number }>();
    
    const callSource = useElevenLabs ? elevenLabsCalls : calls;
    callSource.forEach((call) => {
      const date = format(parseISO(call.created_at), "MMM d");
      const existing = dateMap.get(date) || { date, calls: 0, leads: 0, booked: 0 };
      existing.calls++;
      dateMap.set(date, existing);
    });
    
    leads.forEach((lead) => {
      const date = format(parseISO(lead.created_at), "MMM d");
      const existing = dateMap.get(date) || { date, calls: 0, leads: 0, booked: 0 };
      existing.leads++;
      if (lead.status === "booked") existing.booked++;
      dateMap.set(date, existing);
    });

    return Array.from(dateMap.values()).slice(-14);
  }, [calls, leads, elevenLabsCalls, useElevenLabs]);

  // Lead status distribution
  const leadStatusData = [
    { name: "Pending", value: stats.pendingLeads, color: "hsl(40, 90%, 55%)" },
    { name: "Claimed", value: stats.claimedLeads, color: "hsl(210, 80%, 50%)" },
    { name: "Booked", value: stats.bookedLeads, color: "hsl(145, 63%, 42%)" },
    { name: "Closed", value: stats.closedLeads, color: "hsl(215, 15%, 50%)" },
  ].filter((d) => d.value > 0);

  // Top lanes
  const topLanes = useMemo(() => {
    const laneCounts = loads.reduce((acc, l) => {
      if (l.pickup_state && l.dest_state) {
        const lane = `${l.pickup_state} → ${l.dest_state}`;
        acc[lane] = (acc[lane] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(laneCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lane, count]) => ({ lane, count }));
  }, [loads]);

  return (
    <div className="space-y-6">
      {/* Validation warnings */}
      {stats.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-600">
            {stats.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        </div>
      )}
      
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Calls - expandable with AI call list */}
        <ExpandableKPICard
          label="Total Calls"
          value={stats.totalCalls}
          subtext={`${stats.totalMinutes} min`}
          icon={Phone}
          color="blue"
          tooltip={METRIC_TOOLTIPS.totalCalls.description}
          items={callItems}
          onItemClick={handleCallClick}
          emptyMessage="No calls in this period"
          isExpanded={expandedCard === "calls"}
          onToggle={() => setExpandedCard(expandedCard === "calls" ? null : "calls")}
        />

        {/* Engaged Calls - expandable */}
        <ExpandableKPICard
          label="Engaged Calls"
          value={stats.engagedCount || stats.engagedCalls.length}
          subtext="≥20s or Lead"
          subtextExplainer={METRIC_TOOLTIPS.engagedCalls.description}
          icon={Target}
          color="emerald"
          tooltip={METRIC_TOOLTIPS.engagedCalls.description}
          items={engagedCallItems}
          onItemClick={handleCallClick}
          emptyMessage="No engaged calls yet"
          isExpanded={expandedCard === "engaged"}
          onToggle={() => setExpandedCard(expandedCard === "engaged" ? null : "engaged")}
        />

        {/* Quick Hangups - expandable */}
        <ExpandableKPICard
          label="Quick Hangups"
          value={stats.quickHangups.length}
          subtext={`<${QUICK_HANGUP_THRESHOLD_SECS}s`}
          icon={PhoneOff}
          color="amber"
          tooltip={METRIC_TOOLTIPS.quickHangups.description}
          items={quickHangupItems}
          onItemClick={handleCallClick}
          emptyMessage="No quick hangups"
          isExpanded={expandedCard === "hangups"}
          onToggle={() => setExpandedCard(expandedCard === "hangups" ? null : "hangups")}
        />

        {/* Total Leads - expandable with lead list */}
        <ExpandableKPICard
          label="Total Leads"
          value={stats.totalLeads}
          subtext={`${stats.pendingLeads} pending`}
          subtextExplainer="Pending leads are waiting to be claimed and worked by an agent. At midnight, daily lead counts reset but all leads remain visible in Analytics."
          icon={Users}
          color="purple"
          tooltip={METRIC_TOOLTIPS.leads.description}
          items={leadItems}
          onItemClick={handleLeadClick}
          emptyMessage="No leads in this period"
          isExpanded={expandedCard === "leads"}
          onToggle={() => setExpandedCard(expandedCard === "leads" ? null : "leads")}
        />

        <KPICard
          label="Conversion"
          value={`${stats.conversionRate}%`}
          subtext="calls → bookings"
          icon={TrendingUp}
          color="emerald"
          tooltip={METRIC_TOOLTIPS.conversion.description}
        />
        <KPICard
          label="Open Loads"
          value={stats.openLoads}
          subtext={`${loads.length} total`}
          icon={Package}
          color="slate"
          tooltip="Currently available loads ready to be booked"
        />
      </div>

      {/* Server-side KPIs Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* AI Minutes */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="bg-card border border-border">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-muted-foreground mb-1 truncate">AI Minutes</p>
                      <Info className="h-3 w-3 text-muted-foreground/50" />
                    </div>
                    {kpisLoading ? (
                      <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                    ) : (
                      <p className="text-2xl font-bold tabular-nums text-foreground">
                        {kpis?.ai_minutes?.toFixed(1) ?? stats.totalMinutes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpis?.ai_calls ?? stats.totalCalls} calls
                    </p>
                  </div>
                  <div className="p-2 rounded-lg text-blue-500 bg-blue-500/10">
                    <Clock className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Total time the AI agent actively handled calls in this date range. Calculated from call durations.
          </TooltipContent>
        </Tooltip>

        {/* High Intent */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="bg-card border border-border">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-muted-foreground mb-1 truncate">High Intent</p>
                      <Info className="h-3 w-3 text-muted-foreground/50" />
                    </div>
                    {kpisLoading ? (
                      <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                          {kpis?.high_intent_count ?? stats.highIntentCount}
                        </p>
                        {kpis?.high_intent_delta !== undefined && kpis.high_intent_delta !== 0 && (
                          <span className={`text-sm font-medium ${kpis.high_intent_delta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {kpis.high_intent_delta > 0 ? '+' : ''}{kpis.high_intent_delta}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      intent ≥85% or keyword
                    </p>
                  </div>
                  <div className="p-2 rounded-lg text-amber-500 bg-amber-500/10">
                    <Flame className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Calls flagged as high intent (intent ≥ 85% or matched keyword rules). Green/red number shows change vs previous period.
          </TooltipContent>
        </Tooltip>

        {/* Callback Speed */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="bg-card border border-border">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-muted-foreground mb-1 truncate">Callback Speed</p>
                      <Info className="h-3 w-3 text-muted-foreground/50" />
                    </div>
                    {kpisLoading ? (
                      <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                    ) : (
                      <p className="text-2xl font-bold tabular-nums text-foreground">
                        {formatCallbackSpeed(kpis?.callback_speed_seconds_avg ?? null)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      avg response time
                    </p>
                  </div>
                  <div className="p-2 rounded-lg text-purple-500 bg-purple-500/10">
                    <Zap className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Average time from when a callback was requested to when it was completed. Only includes calls with both timestamps.
          </TooltipContent>
        </Tooltip>

        {/* AEI Score */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="bg-card border border-border">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-muted-foreground mb-1 truncate">AEI Score</p>
                      <Info className="h-3 w-3 text-muted-foreground/50" />
                    </div>
                    {kpisLoading ? (
                      <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                    ) : (
                      <p className={`text-2xl font-bold tabular-nums ${
                        (kpis?.aei_score ?? 0) >= 70 ? 'text-emerald-500' :
                        (kpis?.aei_score ?? 0) >= 40 ? 'text-amber-500' :
                        'text-foreground'
                      }`}>
                        {kpis?.aei_score ?? 0}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      0–100 effectiveness
                    </p>
                  </div>
                  <div className="p-2 rounded-lg text-emerald-500 bg-emerald-500/10">
                    <Gauge className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            0–100 effectiveness score based on conversion, call quality (low quick hangups), and high-intent rate.
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Expanded List Panel - full width */}
      {expandedCard === "calls" && (
        <ExpandedListPanel
          label="Total Calls"
          items={callItems}
          onItemClick={handleCallClick}
          emptyMessage="No calls in this period"
          onClose={() => setExpandedCard(null)}
        />
      )}
      {expandedCard === "engaged" && (
        <ExpandedListPanel
          label="Engaged Calls"
          items={engagedCallItems}
          onItemClick={handleCallClick}
          emptyMessage="No engaged calls yet"
          onClose={() => setExpandedCard(null)}
        />
      )}
      {expandedCard === "hangups" && (
        <ExpandedListPanel
          label="Quick Hangups"
          items={quickHangupItems}
          onItemClick={handleCallClick}
          emptyMessage="No quick hangups"
          onClose={() => setExpandedCard(null)}
        />
      )}
      {expandedCard === "leads" && (
        <ExpandedListPanel
          label="Total Leads"
          items={leadItems}
          onItemClick={handleLeadClick}
          emptyMessage="No leads in this period"
          onClose={() => setExpandedCard(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Activity Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityOverTime.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No activity data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={activityOverTime}>
                  <defs>
                    <linearGradient id="colorCallsGen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(210, 80%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(210, 80%, 50%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorLeadsGen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(270, 50%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(270, 50%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                  <YAxis className="text-xs fill-muted-foreground" />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="calls"
                    name="AI Calls"
                    stroke="hsl(210, 80%, 50%)"
                    fillOpacity={1}
                    fill="url(#colorCallsGen)"
                  />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    name="Leads"
                    stroke="hsl(270, 50%, 60%)"
                    fillOpacity={1}
                    fill="url(#colorLeadsGen)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Lead Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Lead Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leadStatusData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No lead data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={leadStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {leadStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Lanes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Top Lanes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topLanes.length === 0 ? (
              <p className="text-muted-foreground">No lane data available</p>
            ) : (
              <div className="space-y-3">
                {topLanes.map((item, index) => (
                  <div key={item.lane} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                      <span className="text-sm font-medium">{item.lane}</span>
                    </div>
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded">
                      {item.count} loads
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
