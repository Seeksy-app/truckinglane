import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsKPICards } from "./AnalyticsKPICards";
import { 
  Phone, TrendingUp, Clock, Target, Zap, AlertTriangle, Timer, DollarSign, PhoneOff,
  ChevronDown, ChevronRight, ExternalLink, Flame, Copy, Check, FileText, Truck
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, parseISO, getHours } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TranscriptViewerModal } from "./TranscriptViewerModal";
import { toast } from "@/hooks/use-toast";

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
  payload: unknown;
}

interface AICallsTabProps {
  calls: Array<{
    id: string;
    caller_phone: string;
    created_at: string;
    duration_seconds: number | null;
    call_status: string;
  }>;
  leads: Array<{
    id: string;
    status: string;
    is_high_intent: boolean | null;
    intent_score: number | null;
    created_at: string;
  }>;
  aiBookings: Array<{
    id: string;
    booked_at: string | null;
    target_commission: number | null;
  }>;
  elevenLabsCalls?: ElevenLabsCall[];
}

const ENGAGED_THRESHOLD_SECS = 20;
const QUICK_HANGUP_THRESHOLD_SECS = 10;
const HOURLY_RATE_SAVINGS = 25;

// Helper to extract full transcript from payload
const extractTranscript = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  return (p.transcript || p.transcription || p.text) as string | null;
};

// Helper to extract carrier info from payload
const extractCarrierInfo = (payload: unknown): { usdot?: string; mc?: string; company?: string } | null => {
  if (!payload || typeof payload !== 'object') return null;
  
  const p = payload as Record<string, unknown>;
  const analysis = p.analysis as Record<string, unknown> | undefined;
  const data = analysis?.data as Record<string, unknown> | undefined;
  
  return {
    usdot: data?.carrier_usdot as string | undefined,
    mc: data?.carrier_mc as string | undefined,
    company: data?.carrier_name as string | undefined,
  };
};

// Helper to extract outcome
const extractOutcome = (call: ElevenLabsCall): string => {
  const payload = call.payload as Record<string, unknown> | null;
  const analysis = payload?.analysis as Record<string, unknown> | undefined;
  const data = analysis?.data as Record<string, unknown> | undefined;
  
  if (data?.outcome) return data.outcome as string;
  if (call.status === 'done') return 'completed';
  if (call.termination_reason?.includes('hangup')) return 'declined';
  return call.status || 'unknown';
};

// Helper to check high intent
const isHighIntent = (call: ElevenLabsCall): boolean => {
  const duration = call.call_duration_secs || 0;
  if (duration >= 60) return true;
  
  const summary = (call.transcript_summary || '').toLowerCase();
  const highIntentKeywords = ['rate', 'book', 'interested', 'available', 'pickup', 'deliver', 'truck'];
  return highIntentKeywords.some(kw => summary.includes(kw));
};

// Helper to get high intent reasons
const getHighIntentReasons = (call: ElevenLabsCall): string[] => {
  const reasons: string[] = [];
  const duration = call.call_duration_secs || 0;
  
  if (duration >= 60) reasons.push('Long call (60s+)');
  
  const summary = (call.transcript_summary || '').toLowerCase();
  if (summary.includes('rate')) reasons.push('Rate discussion');
  if (summary.includes('book')) reasons.push('Booking intent');
  if (summary.includes('interested')) reasons.push('Expressed interest');
  if (summary.includes('pickup') || summary.includes('deliver')) reasons.push('Route details');
  
  return reasons;
};

export const AICallsTab = ({ calls, leads, aiBookings, elevenLabsCalls = [] }: AICallsTabProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transcriptModal, setTranscriptModal] = useState<{
    open: boolean;
    transcript: string | null;
    summary?: string | null;
    summaryTitle?: string | null;
    callInfo?: {
      externalNumber?: string;
      duration?: number;
      outcome?: string;
      createdAt?: string;
    };
  }>({ open: false, transcript: null });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const useElevenLabs = elevenLabsCalls.length > 0;
  
  const stats = useMemo(() => {
    if (useElevenLabs) {
      const totalCalls = elevenLabsCalls.length;
      const engagedCalls = elevenLabsCalls.filter(c => (c.call_duration_secs || 0) >= ENGAGED_THRESHOLD_SECS).length;
      const quickHangups = elevenLabsCalls.filter(c => (c.call_duration_secs || 0) < QUICK_HANGUP_THRESHOLD_SECS).length;
      const totalSeconds = elevenLabsCalls.reduce((sum, c) => sum + (c.call_duration_secs || 0), 0);
      const aiMinutes = Math.round(totalSeconds / 60 * 10) / 10;
      const estimatedSavings = Math.round((totalSeconds / 3600) * HOURLY_RATE_SAVINGS * 100) / 100;
      const avgDuration = totalCalls > 0 ? Math.round(totalSeconds / totalCalls) : 0;
      
      const doneCalls = elevenLabsCalls.filter(c => c.status === 'done').length;
      const completedPct = totalCalls > 0 ? Math.round((doneCalls / totalCalls) * 100) : 0;
      
      const hourCounts = elevenLabsCalls.reduce((acc, c) => {
        const hour = getHours(parseISO(c.created_at));
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      
      return {
        totalCalls,
        engagedCalls,
        quickHangups,
        aiMinutes,
        estimatedSavings,
        avgDuration,
        completedPct,
        peakHour: peakHour ? `${peakHour[0]}:00` : "N/A",
        peakHourCalls: peakHour ? peakHour[1] : 0,
        conversionRate: totalCalls > 0 ? ((aiBookings.length / totalCalls) * 100).toFixed(1) : "0",
      };
    } else {
      const totalCalls = calls.length;
      const completedCalls = calls.filter((c) => c.call_status === "completed").length;
      const avgDuration = calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / (totalCalls || 1);
      const conversionRate = totalCalls > 0 ? (aiBookings.length / totalCalls) * 100 : 0;
      
      const hourCounts = calls.reduce((acc, c) => {
        const hour = getHours(parseISO(c.created_at));
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

      return {
        totalCalls,
        engagedCalls: completedCalls,
        quickHangups: calls.filter(c => (c.duration_seconds || 0) < QUICK_HANGUP_THRESHOLD_SECS).length,
        aiMinutes: Math.round(calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 60 * 10) / 10,
        estimatedSavings: Math.round((calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 3600) * HOURLY_RATE_SAVINGS * 100) / 100,
        avgDuration: Math.round(avgDuration),
        completedPct: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
        peakHour: peakHour ? `${peakHour[0]}:00` : "N/A",
        peakHourCalls: peakHour ? peakHour[1] : 0,
        conversionRate: conversionRate.toFixed(1),
      };
    }
  }, [calls, elevenLabsCalls, aiBookings, useElevenLabs]);

  const callsOverTime = useMemo(() => {
    const source = useElevenLabs ? elevenLabsCalls : calls;
    const dateMap = new Map<string, number>();
    source.forEach((call) => {
      const date = format(parseISO(call.created_at), "MMM d");
      dateMap.set(date, (dateMap.get(date) || 0) + 1);
    });
    return Array.from(dateMap.entries())
      .map(([date, count]) => ({ date, calls: count }))
      .slice(-14);
  }, [calls, elevenLabsCalls, useElevenLabs]);

  const callsByHour = useMemo(() => {
    const source = useElevenLabs ? elevenLabsCalls : calls;
    const hourData = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}:00`,
      calls: 0,
    }));
    source.forEach((call) => {
      const hour = getHours(parseISO(call.created_at));
      hourData[hour].calls++;
    });
    return hourData.filter((h) => h.calls > 0 || (parseInt(h.hour) >= 6 && parseInt(h.hour) <= 22));
  }, [calls, elevenLabsCalls, useElevenLabs]);

  const outcomesData = useMemo(() => {
    if (!useElevenLabs) return [];
    
    const statusCounts = elevenLabsCalls.reduce((acc, c) => {
      const status = c.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const colors: Record<string, string> = {
      done: "hsl(145, 63%, 42%)",
      completed: "hsl(145, 63%, 42%)",
      failed: "hsl(0, 72%, 51%)",
      in_progress: "hsl(210, 80%, 50%)",
      unknown: "hsl(215, 15%, 50%)",
    };
    
    return Object.entries(statusCounts).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
      value: count,
      color: colors[status] || "hsl(215, 15%, 50%)",
    }));
  }, [elevenLabsCalls, useElevenLabs]);

  const terminationData = useMemo(() => {
    if (!useElevenLabs) return [];
    
    const reasonCounts = elevenLabsCalls.reduce((acc, c) => {
      const reason = c.termination_reason || 'unknown';
      const shortReason = reason.length > 25 ? reason.substring(0, 22) + '...' : reason;
      acc[shortReason] = (acc[shortReason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));
  }, [elevenLabsCalls, useElevenLabs]);

  const kpiCards = [
    { label: "Total AI Calls", value: stats.totalCalls, subtext: `${stats.avgDuration}s avg`, icon: Phone, color: "blue" as const },
    { label: "Engaged Calls", value: stats.engagedCalls, subtext: `≥${ENGAGED_THRESHOLD_SECS}s`, icon: Target, color: "emerald" as const },
    { label: "Quick Hangups", value: stats.quickHangups, subtext: `<${QUICK_HANGUP_THRESHOLD_SECS}s`, icon: PhoneOff, color: "amber" as const },
    { label: "AI Minutes", value: stats.aiMinutes, subtext: "talk time", icon: Timer, color: "purple" as const },
    { label: "Est. Savings", value: `$${stats.estimatedSavings}`, subtext: `@$${HOURLY_RATE_SAVINGS}/hr`, icon: DollarSign, color: "emerald" as const },
    { label: "Conversion", value: `${stats.conversionRate}%`, subtext: "→ bookings", icon: TrendingUp, color: "slate" as const },
  ];

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleCopySummary = async (call: ElevenLabsCall) => {
    const summary = call.transcript_summary || call.call_summary_title || '';
    if (!summary) {
      toast({ title: "No summary to copy", variant: "destructive" });
      return;
    }
    
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedId(call.id);
      toast({ title: "Summary copied" });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleViewTranscript = (call: ElevenLabsCall) => {
    const transcript = extractTranscript(call.payload);
    setTranscriptModal({
      open: true,
      transcript,
      summary: call.transcript_summary,
      summaryTitle: call.call_summary_title,
      callInfo: {
        externalNumber: call.external_number || undefined,
        duration: call.call_duration_secs || undefined,
        outcome: extractOutcome(call),
        createdAt: call.created_at,
      },
    });
  };

  const statusStyles: Record<string, string> = {
    done: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    completed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    failed: "bg-red-500/15 text-red-700 border-red-500/30",
    in_progress: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    unknown: "bg-muted text-muted-foreground border-border",
  };

  const outcomeStyles: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-700",
    confirmed: "bg-emerald-500/15 text-emerald-700",
    booked: "bg-emerald-500/15 text-emerald-700",
    declined: "bg-red-500/15 text-red-700",
    callback_requested: "bg-amber-500/15 text-amber-700",
    no_action: "bg-muted text-muted-foreground",
    unknown: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <AnalyticsKPICards cards={kpiCards} columns={6} />

      {/* Calls Table with Expandable Rows */}
      {useElevenLabs && elevenLabsCalls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Recent AI Calls
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Time</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Phone</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Duration</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Title</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {elevenLabsCalls.slice(0, 50).map((call) => {
                    const highIntent = isHighIntent(call);
                    const outcome = extractOutcome(call);
                    const carrier = extractCarrierInfo(call.payload);
                    const highIntentReasons = highIntent ? getHighIntentReasons(call) : [];
                    const hasTranscript = !!extractTranscript(call.payload);
                    
                    return (
                      <>
                        <TableRow
                          key={call.id}
                          className={`cursor-pointer transition-colors hover:bg-muted/50 ${highIntent ? "bg-amber-500/5" : ""}`}
                          onClick={() => toggleExpand(call.id)}
                        >
                          <TableCell>
                            {expandedId === call.id ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(parseISO(call.created_at), "MMM d, h:mm a")}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {call.external_number || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {call.call_duration_secs ? `${call.call_duration_secs}s` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusStyles[call.status || 'unknown'] || statusStyles.unknown}>
                              {call.status || "unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            <div className="flex items-center gap-2">
                              {highIntent && <Flame className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                              <span className="truncate">{call.call_summary_title || "—"}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        
                        {expandedId === call.id && (
                          <TableRow key={`${call.id}-expanded`}>
                            <TableCell colSpan={6} className="p-0 bg-muted/30">
                              <div className="p-5 border-t border-border/50 space-y-4">
                                {/* Top row: Title + badges */}
                                <div className="flex items-start justify-between gap-4">
                                  <div className="space-y-1">
                                    <h4 className="font-medium text-foreground">
                                      {call.call_summary_title || "Call Summary"}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge className={outcomeStyles[outcome] || outcomeStyles.unknown}>
                                        {outcome.replace('_', ' ')}
                                      </Badge>
                                      {highIntent && (
                                        <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                                          <Flame className="h-3 w-3 mr-1" />
                                          High Intent
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopySummary(call);
                                    }}
                                  >
                                    {copiedId === call.id ? (
                                      <><Check className="h-3 w-3 mr-1" />Copied</>
                                    ) : (
                                      <><Copy className="h-3 w-3 mr-1" />Copy Summary</>
                                    )}
                                  </Button>
                                </div>

                                {/* Summary paragraph */}
                                <div className="rounded-lg bg-background/60 border border-border/40 p-4">
                                  <p className="text-sm text-foreground leading-relaxed">
                                    {call.transcript_summary || "Summary not available yet."}
                                  </p>
                                </div>

                                {/* Meta grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Duration</span>
                                    <p className="font-medium">{call.call_duration_secs ? `${call.call_duration_secs}s` : "—"}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Termination</span>
                                    <p className="font-medium truncate" title={call.termination_reason || ''}>
                                      {call.termination_reason || "—"}
                                    </p>
                                  </div>
                                  {carrier && (carrier.usdot || carrier.mc || carrier.company) && (
                                    <div className="col-span-2">
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Carrier</span>
                                      <p className="font-medium flex items-center gap-2">
                                        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                                        {carrier.company || "Unknown"} 
                                        {carrier.usdot && <span className="text-muted-foreground">DOT {carrier.usdot}</span>}
                                        {carrier.mc && <span className="text-muted-foreground">MC {carrier.mc}</span>}
                                      </p>
                                    </div>
                                  )}
                                  {highIntent && highIntentReasons.length > 0 && (
                                    <div className="col-span-2">
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide">High Intent Reasons</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {highIntentReasons.map((reason, i) => (
                                          <Badge key={i} variant="outline" className="text-xs">
                                            {reason}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewTranscript(call);
                                    }}
                                  >
                                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                                    {hasTranscript ? "View Transcript" : "Transcript N/A"}
                                  </Button>
                                  {carrier && (carrier.usdot || carrier.mc) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Could navigate to carrier intelligence view
                                        toast({ 
                                          title: "Carrier Intelligence", 
                                          description: `DOT: ${carrier.usdot || 'N/A'} | MC: ${carrier.mc || 'N/A'}` 
                                        });
                                      }}
                                    >
                                      <Truck className="h-3.5 w-3.5 mr-1.5" />
                                      Open Carrier
                                    </Button>
                                  )}
                                  {call.conversation_id && (
                                    <span className="text-xs text-muted-foreground self-center ml-auto">
                                      ID: {call.conversation_id.slice(0, 8)}...
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              AI Calls Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {callsOverTime.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No call data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={callsOverTime}>
                  <defs>
                    <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(210, 80%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(210, 80%, 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                  <YAxis className="text-xs fill-muted-foreground" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem" }} />
                  <Area type="monotone" dataKey="calls" stroke="hsl(210, 80%, 50%)" fillOpacity={1} fill="url(#colorCalls)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Outcomes Breakdown */}
        {useElevenLabs && outcomesData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-serif flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Call Outcomes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={outcomesData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {outcomesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Calls by Hour */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Calls by Hour (Peak: {stats.peakHour})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {callsByHour.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={callsByHour}>
                  <XAxis dataKey="hour" className="text-xs fill-muted-foreground" />
                  <YAxis className="text-xs fill-muted-foreground" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="calls" fill="hsl(210, 80%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Termination Reasons */}
        {useElevenLabs && terminationData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-serif flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Call Termination Reasons
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {terminationData.map((item) => (
                  <div key={item.reason} className="flex items-center justify-between">
                    <span className="text-sm truncate max-w-[200px]" title={item.reason}>
                      {item.reason}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${(item.count / stats.totalCalls) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quality Stats fallback */}
        {!useElevenLabs && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-serif flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Call Quality Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Completed Calls</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${stats.completedPct}%` }} />
                    </div>
                    <span className="text-sm font-medium">{stats.completedPct}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Peak Hour</span>
                  <span className="text-sm">{stats.peakHour} ({stats.peakHourCalls} calls)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Transcript Viewer Modal */}
      <TranscriptViewerModal
        open={transcriptModal.open}
        onOpenChange={(open) => setTranscriptModal({ ...transcriptModal, open })}
        transcript={transcriptModal.transcript}
        summary={transcriptModal.summary}
        summaryTitle={transcriptModal.summaryTitle}
        callInfo={transcriptModal.callInfo}
      />
    </div>
  );
};
