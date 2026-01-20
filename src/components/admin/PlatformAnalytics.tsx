import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Building2,
  Users,
  Phone,
  Target,
  TrendingUp,
  Clock,
  Package,
  Loader2,
  BarChart3,
  Calendar,
  Info,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getDateWindow, type DateRangeType } from '@/lib/dateWindows';
import { 
  calculateAnalyticsMetrics,
  METRIC_TOOLTIPS,
  ENGAGED_THRESHOLD_SECS,
  type CallRecord,
  type LeadRecord,
  type LoadRecord,
} from '@/lib/analyticsLogic';

type DateRange = 'today' | '7d' | '30d' | 'all';

interface AgencyAnalytics {
  id: string;
  name: string;
  agentCount: number;
  totalCalls: number;
  engagedCalls: number;
  totalLeads: number;
  highIntent: number;
  conversionRate: number;
  aiMinutes: number;
  avgCallbackSpeed: number;
  openLoads: number;
}

export function PlatformAnalytics() {
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('all');

  // Get date window
  const dateWindow = useMemo(() => {
    return getDateWindow(dateRange as DateRangeType, 'America/New_York');
  }, [dateRange]);

  // Fetch all agencies
  const { data: agencies = [], isLoading: agenciesLoading } = useQuery({
    queryKey: ['platform-analytics-agencies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agencies')
        .select('id, name, created_at')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch agency members counts
  const { data: memberCounts = {} } = useQuery({
    queryKey: ['platform-analytics-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_members')
        .select('agency_id');
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      for (const member of data || []) {
        counts[member.agency_id] = (counts[member.agency_id] || 0) + 1;
      }
      return counts;
    },
  });

  // Fetch all calls with date filter
  const { data: allCalls = [], isLoading: callsLoading } = useQuery({
    queryKey: ['platform-analytics-calls', dateRange],
    queryFn: async () => {
      let query = supabase
        .from('ai_call_summaries')
        .select('id, agency_id, created_at, duration_secs, is_high_intent, call_outcome')
        .order('created_at', { ascending: false });
      
      if (dateWindow.startTs) {
        query = query.gte('created_at', dateWindow.startTs);
      }
      if (dateWindow.endTs) {
        query = query.lte('created_at', dateWindow.endTs);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all leads with date filter
  const { data: allLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['platform-analytics-leads', dateRange],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('id, agency_id, status, created_at, is_high_intent, intent_score, phone_call_id, booked_at')
        .order('created_at', { ascending: false });
      
      if (dateWindow.startTs) {
        query = query.gte('created_at', dateWindow.startTs);
      }
      if (dateWindow.endTs) {
        query = query.lte('created_at', dateWindow.endTs);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all loads with date filter
  const { data: allLoads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ['platform-analytics-loads', dateRange],
    queryFn: async () => {
      let query = supabase
        .from('loads')
        .select('id, agency_id, status, is_active, created_at, booked_at, booked_source')
        .order('created_at', { ascending: false });
      
      if (dateWindow.startTs) {
        query = query.gte('created_at', dateWindow.startTs);
      }
      if (dateWindow.endTs) {
        query = query.lte('created_at', dateWindow.endTs);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate analytics per agency
  const agencyAnalytics: AgencyAnalytics[] = useMemo(() => {
    return agencies.map((agency) => {
      // Filter data for this agency
      const agencyCalls = allCalls.filter(c => c.agency_id === agency.id);
      const agencyLeads = allLeads.filter(l => l.agency_id === agency.id);
      const agencyLoads = allLoads.filter(l => l.agency_id === agency.id);
      
      // Normalize data for analytics calculation
      const normalizedCalls: CallRecord[] = agencyCalls.map(c => ({
        id: c.id,
        created_at: c.created_at,
        duration_secs: c.duration_secs,
        is_high_intent: c.is_high_intent,
      }));
      
      const normalizedLeads: LeadRecord[] = agencyLeads.map(l => ({
        id: l.id,
        status: l.status,
        created_at: l.created_at,
        is_high_intent: l.is_high_intent,
        intent_score: l.intent_score,
        phone_call_id: l.phone_call_id,
        booked_at: l.booked_at,
      }));
      
      const normalizedLoads: LoadRecord[] = agencyLoads.map(l => ({
        id: l.id,
        status: l.status,
        is_active: l.is_active,
        created_at: l.created_at,
        booked_at: l.booked_at,
        booked_source: l.booked_source,
      }));
      
      const metrics = calculateAnalyticsMetrics(normalizedCalls, normalizedLeads, normalizedLoads);
      
      return {
        id: agency.id,
        name: agency.name,
        agentCount: memberCounts[agency.id] || 0,
        totalCalls: metrics.totalCalls,
        engagedCalls: metrics.engagedCalls,
        totalLeads: metrics.totalLeads,
        highIntent: metrics.highIntentCount,
        conversionRate: metrics.callToBookedRate,
        aiMinutes: metrics.totalMinutes,
        avgCallbackSpeed: 0, // Would need callback data
        openLoads: metrics.openLoads,
      };
    });
  }, [agencies, allCalls, allLeads, allLoads, memberCounts]);

  // Filtered analytics (for single agency view)
  const displayedAnalytics = useMemo(() => {
    if (selectedAgencyId === 'all') return agencyAnalytics;
    return agencyAnalytics.filter(a => a.id === selectedAgencyId);
  }, [agencyAnalytics, selectedAgencyId]);

  // Platform totals
  const platformTotals = useMemo(() => {
    return agencyAnalytics.reduce(
      (acc, agency) => ({
        agents: acc.agents + agency.agentCount,
        calls: acc.calls + agency.totalCalls,
        engaged: acc.engaged + agency.engagedCalls,
        leads: acc.leads + agency.totalLeads,
        highIntent: acc.highIntent + agency.highIntent,
        aiMinutes: acc.aiMinutes + agency.aiMinutes,
        openLoads: acc.openLoads + agency.openLoads,
      }),
      { agents: 0, calls: 0, engaged: 0, leads: 0, highIntent: 0, aiMinutes: 0, openLoads: 0 }
    );
  }, [agencyAnalytics]);

  const isLoading = agenciesLoading || callsLoading || leadsLoading || loadsLoading;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Agency Analytics
              </CardTitle>
              <CardDescription>
                Performance metrics across all agencies
              </CardDescription>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by agency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agencies</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
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
                  7D
                </ToggleGroupItem>
                <ToggleGroupItem value="30d" className="px-3 text-sm data-[state=on]:bg-muted">
                  30D
                </ToggleGroupItem>
                <ToggleGroupItem value="all" className="px-3 text-sm data-[state=on]:bg-muted">
                  All
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Platform Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Users className="h-3.5 w-3.5" />
                    Agents
                  </div>
                  <p className="text-xl font-bold">{platformTotals.agents}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>Total agents across all agencies</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Phone className="h-3.5 w-3.5" />
                    Total Calls
                  </div>
                  <p className="text-xl font-bold">{platformTotals.calls}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>{METRIC_TOOLTIPS.totalCalls.description}</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Target className="h-3.5 w-3.5" />
                    Engaged
                  </div>
                  <p className="text-xl font-bold">{platformTotals.engaged}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>{METRIC_TOOLTIPS.engagedCalls.description}</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Leads
                  </div>
                  <p className="text-xl font-bold">{platformTotals.leads}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>{METRIC_TOOLTIPS.leads.description}</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Target className="h-3.5 w-3.5 text-amber-500" />
                    High Intent
                  </div>
                  <p className="text-xl font-bold">{platformTotals.highIntent}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>{METRIC_TOOLTIPS.highIntent.description}</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Clock className="h-3.5 w-3.5" />
                    AI Minutes
                  </div>
                  <p className="text-xl font-bold">{platformTotals.aiMinutes}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>{METRIC_TOOLTIPS.aiMinutes.description}</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Package className="h-3.5 w-3.5" />
                    Open Loads
                  </div>
                  <p className="text-xl font-bold">{platformTotals.openLoads}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>Active loads available for booking</TooltipContent>
            </Tooltip>
          </div>
          
          {/* Agency Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayedAnalytics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No agencies found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead className="text-center">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-center gap-1">
                        Agents
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>Number of agents in agency</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-center gap-1">
                        Calls
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>{METRIC_TOOLTIPS.totalCalls.description}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-center gap-1">
                        Engaged
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>{METRIC_TOOLTIPS.engagedCalls.description}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-center gap-1">
                        Leads
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>{METRIC_TOOLTIPS.leads.description}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-center gap-1">
                        High Intent
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>{METRIC_TOOLTIPS.highIntent.description}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-center gap-1">
                        Conv. %
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>{METRIC_TOOLTIPS.conversion.description}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-center gap-1">
                        AI Min
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>{METRIC_TOOLTIPS.aiMinutes.description}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">Open Loads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedAnalytics.map((agency) => (
                  <TableRow key={agency.id}>
                    <TableCell className="font-medium">{agency.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{agency.agentCount}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{agency.totalCalls}</TableCell>
                    <TableCell className="text-center">
                      <span className={agency.engagedCalls > 0 ? "text-emerald-600 font-medium" : ""}>
                        {agency.engagedCalls}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{agency.totalLeads}</TableCell>
                    <TableCell className="text-center">
                      <span className={agency.highIntent > 0 ? "text-amber-600 font-medium" : ""}>
                        {agency.highIntent}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={agency.conversionRate > 0 ? "text-emerald-600 font-medium" : ""}>
                        {agency.conversionRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{agency.aiMinutes}</TableCell>
                    <TableCell className="text-center">{agency.openLoads}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}