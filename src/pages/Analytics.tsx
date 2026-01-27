import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, MessageSquare, BarChart3, Calendar, TrendingUp, Users, Building2, FileText, Bug } from "lucide-react";
import { useRealtimeDashboard } from "@/hooks/useRealtimeDashboard";
import { FinancialTab } from "@/components/analytics/FinancialTab";
import { SentimentTab } from "@/components/analytics/SentimentTab";
import { GeneralTab } from "@/components/analytics/GeneralTab";
import { AgencyROIView } from "@/components/analytics/AgencyROIView";
import { ReportsTab } from "@/components/analytics/ReportsTab";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { getDateWindow, getTimezoneLabel, type DateRangeType } from "@/lib/dateWindows";
import { useAnalyticsKPIs, type AnalyticsKPIs } from "@/hooks/useCanonicalMetrics";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type DateRange = "today" | "7d" | "30d" | "all";
type ScopeFilter = "agency" | "agent";

const Analytics = () => {
  const { user, loading: authLoading } = useAuth();
  const { role, agencyId, loading: roleLoading } = useUserRole();
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [activeTab, setActiveTab] = useState("general");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("agency");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");

  const isAdmin = role === "agency_admin" || role === "super_admin";

  const { timezone } = useUserTimezone();
  useRealtimeDashboard();

  // Fetch user's agency_id
  const { data: agencyMember } = useQuery({
    queryKey: ["agency_member", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agency_members")
        .select("agency_id")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch agents for admin filter (only if admin)
  const { data: agents = [] } = useQuery({
    queryKey: ["analytics-agents", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agency_members")
        .select("user_id, profiles(id, full_name, email)")
        .eq("agency_id", agencyId!);
      if (error) throw error;
      return data.map((am) => ({
        id: am.user_id,
        name: (am.profiles as any)?.full_name || (am.profiles as any)?.email || am.user_id,
        email: (am.profiles as any)?.email,
      }));
    },
    enabled: !!agencyId && isAdmin,
  });

  // Date filter using timezone-aware helper
  const dateWindow = useMemo(() => {
    return getDateWindow(dateRange as DateRangeType, timezone);
  }, [dateRange, timezone]);

  const dateFilter = useMemo(() => {
    return {
      start: dateWindow.startTs ? new Date(dateWindow.startTs) : null,
      end: dateWindow.endTs ? new Date(dateWindow.endTs) : null,
    };
  }, [dateWindow]);

  // Determine effective agent ID for filtering
  const effectiveAgentId = useMemo(() => {
    if (!isAdmin || scopeFilter === "agency") return null;
    if (selectedAgentId === "all") return null;
    return selectedAgentId;
  }, [isAdmin, scopeFilter, selectedAgentId]);

  // Fetch analytics KPIs from the RPC (server-side aggregation)
  const { data: kpis, isLoading: kpisLoading } = useAnalyticsKPIs({
    agencyId: agencyId || agencyMember?.agency_id || null,
    agentId: effectiveAgentId,
    startTs: dateFilter.start,
    endTs: dateFilter.end,
    enabled: !!user && !!(agencyId || agencyMember?.agency_id),
  });

  // Fetch phone calls
  const { data: calls = [] } = useQuery({
    queryKey: ["analytics-calls", dateRange],
    queryFn: async () => {
      let query = supabase
        .from("phone_calls")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (dateFilter.start) {
        query = query.gte("created_at", dateFilter.start.toISOString());
      }
      if (dateFilter.end) {
        query = query.lte("created_at", dateFilter.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch leads
  const { data: leads = [] } = useQuery({
    queryKey: ["analytics-leads", dateRange],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (dateFilter.start) {
        query = query.gte("created_at", dateFilter.start.toISOString());
      }
      if (dateFilter.end) {
        query = query.lte("created_at", dateFilter.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch loads
  const { data: loads = [] } = useQuery({
    queryKey: ["analytics-loads", dateRange],
    queryFn: async () => {
      let query = supabase
        .from("loads")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (dateFilter.start) {
        query = query.gte("created_at", dateFilter.start.toISOString());
      }
      if (dateFilter.end) {
        query = query.lte("created_at", dateFilter.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch AI-attributed bookings
  const { data: aiBookings = [] } = useQuery({
    queryKey: ["analytics-ai-bookings", dateRange],
    queryFn: async () => {
      let query = supabase
        .from("loads")
        .select("*")
        .eq("booked_source", "ai")
        .order("booked_at", { ascending: false });
      
      if (dateFilter.start) {
        query = query.gte("booked_at", dateFilter.start.toISOString());
      }
      if (dateFilter.end) {
        query = query.lte("booked_at", dateFilter.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch AI call summaries (canonical source for call analytics - no duplicates)
  const { data: elevenLabsCalls = [] } = useQuery({
    queryKey: ["analytics-ai-call-summaries", dateRange, agencyId || agencyMember?.agency_id],
    queryFn: async () => {
      const effectiveAgencyId = agencyId || agencyMember?.agency_id;
      if (!effectiveAgencyId) return [];
      
      let query = supabase
        .from("ai_call_summaries")
        .select("id, created_at, duration_secs, is_high_intent, conversation_id, external_number, summary_title, summary_short, termination_reason, call_outcome")
        .eq("agency_id", effectiveAgencyId)
        .order("created_at", { ascending: false });
      
      if (dateFilter.start) {
        query = query.gte("created_at", dateFilter.start.toISOString());
      }
      if (dateFilter.end) {
        query = query.lte("created_at", dateFilter.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Transform to match expected interface (map duration_secs to call_duration_secs)
      return (data || []).map(c => ({
        ...c,
        call_duration_secs: c.duration_secs,
        call_summary_title: c.summary_title,
        transcript_summary: c.summary_short,
        status: 'done',
        payload: null,
      }));
    },
    enabled: !!user && !!(agencyId || agencyMember?.agency_id),
  });

  // Fetch conversations for sentiment analysis
  const { data: conversations = [] } = useQuery({
    queryKey: ["analytics-conversations", dateRange],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (dateFilter.start) {
        query = query.gte("created_at", dateFilter.start.toISOString());
      }
      if (dateFilter.end) {
        query = query.lte("created_at", dateFilter.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Scope and agent filtering for data
  const filteredData = useMemo(() => {
    if (!isAdmin || scopeFilter === "agency") {
      return { calls, leads, loads, aiBookings, elevenLabsCalls, conversations };
    }

    // Agent-specific filtering
    if (selectedAgentId === "all") {
      return { calls, leads, loads, aiBookings, elevenLabsCalls, conversations };
    }

    // Filter by agent - this would need agent_id on calls (currently not implemented in full)
    // For now we return full data; proper filtering would require agent attribution
    return { calls, leads, loads, aiBookings, elevenLabsCalls, conversations };
  }, [calls, leads, loads, aiBookings, elevenLabsCalls, conversations, scopeFilter, selectedAgentId, isAdmin]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-serif font-semibold">Analytics</h1>
                <p className="text-muted-foreground text-sm">
                  Performance insights and ROI metrics
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                {/* Admin-only scope controls */}
                {isAdmin && (
                  <>
                    <ToggleGroup
                      type="single"
                      value={scopeFilter}
                      onValueChange={(v) => v && setScopeFilter(v as ScopeFilter)}
                      className="border rounded-md bg-card"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ToggleGroupItem value="agency" className="px-3 text-sm data-[state=on]:bg-muted">
                            <Building2 className="h-4 w-4 mr-1.5" />
                            Agency
                          </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent>View metrics for all agents combined</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ToggleGroupItem value="agent" className="px-3 text-sm data-[state=on]:bg-muted">
                            <Users className="h-4 w-4 mr-1.5" />
                            Agent
                          </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent>View metrics filtered by agent</TooltipContent>
                      </Tooltip>
                    </ToggleGroup>

                    {scopeFilter === "agent" && (
                      <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Select agent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Agents</SelectItem>
                          {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                )}

                <ToggleGroup
                  type="single"
                  value={dateRange}
                  onValueChange={(v) => v && setDateRange(v as DateRange)}
                  className="border rounded-md bg-card"
                >
                  <ToggleGroupItem value="today" className="px-3 text-sm data-[state=on]:bg-muted">
                    <Calendar className="h-4 w-4 mr-1.5" />
                    Today
                  </ToggleGroupItem>
                  <ToggleGroupItem value="7d" className="px-3 text-sm data-[state=on]:bg-muted">
                    7 Days
                  </ToggleGroupItem>
                  <ToggleGroupItem value="30d" className="px-3 text-sm data-[state=on]:bg-muted">
                    30 Days
                  </ToggleGroupItem>
                  <ToggleGroupItem value="all" className="px-3 text-sm data-[state=on]:bg-muted">
                    All Time
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-card border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="general" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    General
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Overview of calls, leads, and conversions</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="financial" className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Financial
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Cost tracking and revenue metrics</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="sentiment" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Sentiment
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>AI-detected caller tone and satisfaction</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="roi" className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Agency ROI
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Return on investment and time savings</TooltipContent>
              </Tooltip>
              {isAdmin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="reports" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Reports
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Daily agency performance reports</TooltipContent>
                </Tooltip>
              )}
            </TabsList>

            <TabsContent value="general">
              <GeneralTab 
                loads={filteredData.loads} 
                leads={filteredData.leads} 
                calls={filteredData.calls}
                elevenLabsCalls={filteredData.elevenLabsCalls}
                aiBookings={filteredData.aiBookings}
                kpis={kpis}
                kpisLoading={kpisLoading}
              />
            </TabsContent>

            <TabsContent value="financial">
              <FinancialTab loads={filteredData.loads} aiBookings={filteredData.aiBookings} elevenLabsCalls={filteredData.elevenLabsCalls} />
            </TabsContent>

            <TabsContent value="sentiment">
              <SentimentTab conversations={filteredData.conversations} calls={filteredData.calls} elevenLabsCalls={filteredData.elevenLabsCalls} />
            </TabsContent>

            <TabsContent value="roi">
              <AgencyROIView agencyId={agencyMember?.agency_id || null} dateRange={dateFilter} />
            </TabsContent>

            {isAdmin && (
              <TabsContent value="reports">
                <ReportsTab agencyId={agencyId || agencyMember?.agency_id || null} dateRange={dateRange} />
              </TabsContent>
            )}
          </Tabs>

          {/* Debug Panel (Admin only) */}
          {isAdmin && (
            <Collapsible className="mt-6">
              <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                <Bug className="h-3 w-3" />
                Debug Info
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 p-3 bg-muted/50 rounded-md text-xs font-mono">
                <div className="space-y-1">
                  <div><span className="text-muted-foreground">agency_id:</span> {agencyId || agencyMember?.agency_id || 'null'}</div>
                  <div><span className="text-muted-foreground">agent_id:</span> {effectiveAgentId || 'null (agency-wide)'}</div>
                  <div><span className="text-muted-foreground">start_ts:</span> {dateFilter.start?.toISOString() || 'null'}</div>
                  <div><span className="text-muted-foreground">end_ts:</span> {dateFilter.end?.toISOString() || 'null'}</div>
                  <div className="pt-2 border-t border-border mt-2">
                    <span className="text-muted-foreground">KPIs Response:</span>
                    <pre className="mt-1 overflow-auto max-h-40">{JSON.stringify(kpis, null, 2)}</pre>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Analytics;
