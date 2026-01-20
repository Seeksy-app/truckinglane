import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, Zap, TrendingUp, Phone, CheckCircle } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface AgencyROIViewProps {
  agencyId: string | null;
  dateRange: { start: Date | null; end: Date | null };
}

export function AgencyROIView({ agencyId, dateRange }: AgencyROIViewProps) {
  // Fetch agent daily stats for the agency
  const { data: agentStats = [] } = useQuery({
    queryKey: ["agency-roi-stats", agencyId, dateRange.start?.toISOString(), dateRange.end?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("agent_daily_stats")
        .select(`
          *,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .order("stat_date", { ascending: false });
      
      if (agencyId) {
        query = query.eq("agency_id", agencyId);
      }
      
      if (dateRange.start) {
        query = query.gte("stat_date", dateRange.start.toISOString().split('T')[0]);
      }
      if (dateRange.end) {
        query = query.lte("stat_date", dateRange.end.toISOString().split('T')[0]);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

  // Fetch phone calls for call distribution
  const { data: calls = [] } = useQuery({
    queryKey: ["agency-roi-calls", agencyId, dateRange.start?.toISOString(), dateRange.end?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("phone_calls")
        .select("id, duration_seconds, created_at")
        .order("created_at", { ascending: false });
      
      if (dateRange.start) {
        query = query.gte("created_at", dateRange.start.toISOString());
      }
      if (dateRange.end) {
        query = query.lte("created_at", dateRange.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

  // Fetch leads for conversion analysis
  const { data: leads = [] } = useQuery({
    queryKey: ["agency-roi-leads", agencyId, dateRange.start?.toISOString(), dateRange.end?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id, is_high_intent, status, created_at, claimed_at")
        .order("created_at", { ascending: false });
      
      if (dateRange.start) {
        query = query.gte("created_at", dateRange.start.toISOString());
      }
      if (dateRange.end) {
        query = query.lte("created_at", dateRange.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

  // Calculate aggregated metrics
  const metrics = useMemo(() => {
    // Aggregate by agent
    const agentMap = new Map<string, {
      name: string;
      totalMinutes: number;
      highIntentCalls: number;
      totalCalls: number;
      avgCallbackSecs: number;
      avgAEI: number;
      days: number;
    }>();

    agentStats.forEach((stat) => {
      const userId = stat.user_id;
      const existing = agentMap.get(userId);
      const profileData = stat.profiles as { full_name?: string; email?: string } | null;
      const name = profileData?.full_name || profileData?.email || 'Unknown';
      
      if (existing) {
        existing.totalMinutes += Number(stat.ai_minutes_saved) || 0;
        existing.highIntentCalls += stat.high_intent_calls || 0;
        existing.totalCalls += stat.total_calls || 0;
        existing.avgCallbackSecs = (existing.avgCallbackSecs * existing.days + (Number(stat.avg_callback_seconds) || 0)) / (existing.days + 1);
        existing.avgAEI = (existing.avgAEI * existing.days + (Number(stat.aei_score) || 0)) / (existing.days + 1);
        existing.days += 1;
      } else {
        agentMap.set(userId, {
          name,
          totalMinutes: Number(stat.ai_minutes_saved) || 0,
          highIntentCalls: stat.high_intent_calls || 0,
          totalCalls: stat.total_calls || 0,
          avgCallbackSecs: Number(stat.avg_callback_seconds) || 0,
          avgAEI: Number(stat.aei_score) || 0,
          days: 1,
        });
      }
    });

    const agentData = Array.from(agentMap.values());
    
    // Totals
    const totalMinutes = agentData.reduce((sum, a) => sum + a.totalMinutes, 0);
    const totalHighIntent = agentData.reduce((sum, a) => sum + a.highIntentCalls, 0);
    const totalCalls = calls.length;
    const avgAEI = agentData.length > 0 
      ? agentData.reduce((sum, a) => sum + a.avgAEI, 0) / agentData.length 
      : 0;

    // Call distribution (AI handled vs needs human)
    const aiHandledCalls = calls.filter((c) => (c.duration_seconds || 0) > 30).length;
    const quickCalls = calls.filter((c) => (c.duration_seconds || 0) <= 30).length;

    // High-intent close rate
    const highIntentLeads = leads.filter((l) => l.is_high_intent);
    const highIntentBooked = highIntentLeads.filter((l) => l.status === 'booked').length;
    const highIntentCloseRate = highIntentLeads.length > 0 
      ? (highIntentBooked / highIntentLeads.length) * 100 
      : 0;

    // Baseline close rate (non-high-intent)
    const normalLeads = leads.filter((l) => !l.is_high_intent);
    const normalBooked = normalLeads.filter((l) => l.status === 'booked').length;
    const baselineCloseRate = normalLeads.length > 0 
      ? (normalBooked / normalLeads.length) * 100 
      : 0;

    // Callback speed distribution (in minutes)
    const callbackSpeeds = leads
      .filter((l) => l.claimed_at)
      .map((l) => {
        const created = new Date(l.created_at).getTime();
        const claimed = new Date(l.claimed_at!).getTime();
        return (claimed - created) / 60000; // minutes
      });
    
    const speedBuckets = [
      { name: "<1m", count: callbackSpeeds.filter((s) => s < 1).length },
      { name: "1-5m", count: callbackSpeeds.filter((s) => s >= 1 && s < 5).length },
      { name: "5-15m", count: callbackSpeeds.filter((s) => s >= 5 && s < 15).length },
      { name: "15-30m", count: callbackSpeeds.filter((s) => s >= 15 && s < 30).length },
      { name: "30m+", count: callbackSpeeds.filter((s) => s >= 30).length },
    ];

    return {
      agentData: agentData.sort((a, b) => b.avgAEI - a.avgAEI),
      totalMinutes: Math.round(totalMinutes),
      totalHighIntent,
      totalCalls,
      avgAEI: Math.round(avgAEI),
      callDistribution: [
        { name: "AI Handled", value: aiHandledCalls, color: "hsl(var(--primary))" },
        { name: "Quick/Transfer", value: quickCalls, color: "hsl(var(--muted-foreground))" },
      ],
      highIntentCloseRate: Math.round(highIntentCloseRate),
      baselineCloseRate: Math.round(baselineCloseRate),
      speedBuckets,
    };
  }, [agentStats, calls, leads]);

  // Estimated cost savings (assuming $0.50/min AI vs $2/min human)
  const estimatedSavings = Math.round(metrics.totalMinutes * 1.50);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.totalMinutes}m</p>
                <p className="text-xs text-muted-foreground">Total AI Minutes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">${estimatedSavings}</p>
                <p className="text-xs text-muted-foreground">Est. Cost Savings</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.totalHighIntent}</p>
                <p className="text-xs text-muted-foreground">High-Intent Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.avgAEI}</p>
                <p className="text-xs text-muted-foreground">Avg AEI Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Call Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" />
              Call Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.callDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {metrics.callDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span>AI Handled ({metrics.callDistribution[0]?.value || 0})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                <span>Quick/Transfer ({metrics.callDistribution[1]?.value || 0})</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Callback Speed Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Callback Speed Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.speedBuckets}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Close Rate Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="h-4 w-4" />
            High-Intent Close Rate vs Baseline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">High-Intent Leads</span>
                <span className="text-lg font-bold text-emerald-600">{metrics.highIntentCloseRate}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${metrics.highIntentCloseRate}%` }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Baseline Leads</span>
                <span className="text-lg font-bold text-muted-foreground">{metrics.baselineCloseRate}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-muted-foreground rounded-full transition-all duration-500"
                  style={{ width: `${metrics.baselineCloseRate}%` }}
                />
              </div>
            </div>
          </div>
          {metrics.highIntentCloseRate > metrics.baselineCloseRate && (
            <p className="text-sm text-emerald-600 mt-4">
              ✨ High-intent leads close {metrics.highIntentCloseRate - metrics.baselineCloseRate}% better than baseline
            </p>
          )}
        </CardContent>
      </Card>

      {/* Agent Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Time Saved per Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.agentData.length > 0 ? (
            <div className="space-y-3">
              {metrics.agentData.map((agent, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {agent.highIntentCalls} high-intent • {agent.totalCalls} total calls
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{Math.round(agent.totalMinutes)}m saved</p>
                    <p className="text-xs text-muted-foreground">AEI: {Math.round(agent.avgAEI)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No agent data available for this period
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}