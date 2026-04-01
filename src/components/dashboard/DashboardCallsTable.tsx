import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Phone,
  ChevronDown,
  ChevronRight,
  Flame,
  Copy,
  Check,
  Truck,
  ExternalLink,
} from "lucide-react";
import { format, parseISO } from "date-fns";
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
import { toast } from "@/hooks/use-toast";
import { PhoneDisplay } from "@/components/ui/phone-display";
import { TranscriptTwoColumnList } from "@/lib/callTranscript";
import { CALLS_TABLE_DENSE_CLASS } from "@/lib/loadTableDisplay";
import { CallAISummaryBullets } from "@/components/calls/CallAISummaryBullets";
import { extractTranscriptFromElevenlabsPayload } from "@/lib/elevenlabsPayload";
import type { Json } from "@/integrations/supabase/types";

interface AICallSummary {
  id: string;
  created_at: string;
  duration_secs: number | null;
  call_outcome: string | null;
  termination_reason: string | null;
  summary_title: string | null;
  summary_short: string | null;
  /** Full post-call summary (2–3 sentences) from webhook */
  summary?: string | null;
  external_number: string | null;
  conversation_id: string | null;
  is_high_intent: boolean | null;
  carrier_name: string | null;
  carrier_usdot: string | null;
  transcript: string | null;
  lead_status?: 'pending' | 'claimed' | 'closed' | 'booked' | null;
  /** Latest elevenlabs_post_calls row for this conversation_id */
  epc?: {
    conversation_id: string | null;
    transcript_summary: string | null;
    call_summary_title: string | null;
    payload: Json;
  } | null;
}

interface DashboardCallsTableProps {
  calls: AICallSummary[];
  loading?: boolean;
}

// Lead status display config
const leadStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Lead', className: 'bg-blue-500/15 text-blue-700' },
  claimed: { label: 'Claimed', className: 'bg-amber-500/15 text-amber-700' },
  closed: { label: 'Closed', className: 'bg-muted text-muted-foreground' },
  booked: { label: 'Booked', className: 'bg-emerald-500/15 text-emerald-700' },
  none: { label: 'No Lead', className: 'bg-muted/50 text-muted-foreground' },
};

// Helper to extract phone number
const extractPhoneNumber = (call: AICallSummary): string => {
  if (call.external_number && call.external_number !== 'unknown') {
    return call.external_number;
  }
  return 'unknown';
};

// Helper to extract outcome - use call_outcome directly
const extractOutcome = (call: AICallSummary): string => {
  if (call.call_outcome) return call.call_outcome;
  if (call.termination_reason?.includes('hangup')) return 'declined';
  return 'completed';
};

// Helper to check high intent - use is_high_intent field directly
const checkHighIntent = (call: AICallSummary): boolean => {
  if (call.is_high_intent) return true;
  
  const duration = call.duration_secs || 0;
  if (duration >= 60) return true;
  
  const summary = (
    call.summary_short ||
    call.summary ||
    call.epc?.transcript_summary ||
    ''
  ).toLowerCase();
  const highIntentKeywords = ['rate', 'book', 'interested', 'available', 'pickup', 'deliver', 'truck'];
  return highIntentKeywords.some(kw => summary.includes(kw));
};

// Helper to get high intent reasons
const getHighIntentReasons = (call: AICallSummary): string[] => {
  const reasons: string[] = [];
  const duration = call.duration_secs || 0;
  
  if (duration >= 60) reasons.push('Long call (60s+)');
  
  const summary = (
    call.summary_short ||
    call.summary ||
    call.epc?.transcript_summary ||
    ''
  ).toLowerCase();
  if (summary.includes('rate')) reasons.push('Rate discussion');
  if (summary.includes('book')) reasons.push('Booking intent');
  if (summary.includes('interested')) reasons.push('Expressed interest');
  if (summary.includes('pickup') || summary.includes('deliver')) reasons.push('Route details');
  
  return reasons;
};

const INITIAL_DISPLAY_COUNT = 25;

const CALL_ROW_CELL_CLASS =
  "text-left align-middle text-sm sm:text-base tabular-nums";

export const DashboardCallsTable = ({ calls, loading }: DashboardCallsTableProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    setTranscriptOpen(false);
  }, [expandedId]);

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

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleCopySummary = async (call: AICallSummary) => {
    const summary =
      call.epc?.transcript_summary?.trim() ||
      call.summary ||
      call.summary_short ||
      call.summary_title ||
      '';
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

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground animate-pulse">
          Loading calls...
        </CardContent>
      </Card>
    );
  }

  if (calls.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-lg font-medium text-foreground">No calls today</p>
          <p className="text-sm text-muted-foreground mt-1">AI calls will appear here as they come in</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-serif flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Recent AI Calls
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="w-full min-w-0 overflow-x-auto">
            <Table className={CALLS_TABLE_DENSE_CLASS}>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8 px-0.5 text-left align-middle" />
                  <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-left">
                    Time
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-left">
                    Phone
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-left">
                    Duration
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-left">
                    Call Status
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-left">
                    Lead Status
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-left">
                    Title
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.slice(0, displayCount).map((call) => {
                  const highIntent = checkHighIntent(call);
                  const outcome = extractOutcome(call);
                  const carrier = { usdot: call.carrier_usdot, company: call.carrier_name, mc: null as string | null };
                  const highIntentReasons = highIntent ? getHighIntentReasons(call) : [];
                  const phoneNumber = extractPhoneNumber(call);
                  const displayTitle =
                    call.epc?.call_summary_title?.trim() || call.summary_title || null;
                  const aiSummaryBlock =
                    call.epc?.transcript_summary?.trim() ||
                    call.summary?.trim() ||
                    call.summary_short?.trim() ||
                    null;
                  const transcriptFromPayload = call.epc?.payload
                    ? extractTranscriptFromElevenlabsPayload(call.epc.payload)
                    : null;
                  const transcriptToShow =
                    transcriptFromPayload?.trim() || call.transcript?.trim() || null;

                  return (
                    <Fragment key={call.id}>
                      <TableRow
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${highIntent ? "bg-amber-500/5" : ""}`}
                        onClick={() => toggleExpand(call.id)}
                      >
                        <TableCell className="w-8 px-0.5 text-left align-middle text-sm sm:text-base">
                          <span className="inline-flex justify-start">
                            {expandedId === call.id ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </span>
                        </TableCell>
                        <TableCell className={CALL_ROW_CELL_CLASS}>
                          {format(parseISO(call.created_at), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell className={`${CALL_ROW_CELL_CLASS} font-medium`}>
                          <PhoneDisplay phone={phoneNumber} className="font-semibold" />
                        </TableCell>
                        <TableCell className={CALL_ROW_CELL_CLASS}>
                          {call.duration_secs ? `${call.duration_secs}s` : "—"}
                        </TableCell>
                        <TableCell className="text-left align-middle text-sm sm:text-base">
                          <Badge
                            className={
                              outcomeStyles[call.call_outcome || "unknown"] || outcomeStyles.unknown
                            }
                          >
                            {call.call_outcome || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-left align-middle text-sm sm:text-base">
                          {(() => {
                            const status = call.lead_status || "none";
                            const config = leadStatusConfig[status] || leadStatusConfig.none;
                            return <Badge className={config.className}>{config.label}</Badge>;
                          })()}
                        </TableCell>
                        <TableCell className="max-w-[min(14rem,40vw)] text-left align-middle text-sm sm:text-base min-w-0">
                          <div className="flex items-center justify-start gap-2 min-w-0">
                            {highIntent && (
                              <Flame className="h-4 w-4 text-amber-500 shrink-0" />
                            )}
                            <Link
                              to={`/calls/${call.id}`}
                              className="truncate hover:underline text-primary min-w-0"
                              title="Open call detail"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {displayTitle || "—"}
                            </Link>
                            <Link
                              to={`/calls/${call.id}`}
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label="Open call detail"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {expandedId === call.id && (
                        <TableRow key={`${call.id}-expanded`}>
                          <TableCell colSpan={7} className="p-0 bg-muted/30">
                            <div className="p-5 border-t border-border/50 space-y-4 text-left">
                              {/* Top row: Call status | Lead status | Title | Copy Summary */}
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full min-w-0">
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  <Badge
                                    className={
                                      outcomeStyles[outcome] || outcomeStyles.unknown
                                    }
                                  >
                                    {outcome}
                                  </Badge>
                                  {(() => {
                                    const status = call.lead_status || "none";
                                    const config =
                                      leadStatusConfig[status] || leadStatusConfig.none;
                                    return (
                                      <Badge className={config.className}>
                                        {config.label}
                                      </Badge>
                                    );
                                  })()}
                                  {highIntent && (
                                    <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1">
                                      <Flame className="h-3 w-3" />
                                      High Intent
                                    </Badge>
                                  )}
                                </div>
                                <h4 className="font-semibold text-foreground min-w-0 flex-1 truncate text-left">
                                  {displayTitle || call.summary_title || "Call Summary"}
                                </h4>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopySummary(call);
                                  }}
                                  className="gap-1.5 text-xs shrink-0 self-end sm:self-center sm:ml-auto"
                                >
                                  {copiedId === call.id ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                  Copy Summary
                                </Button>
                              </div>

                              {aiSummaryBlock && (
                                <div className="space-y-2">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                                    AI summary
                                  </p>
                                  <div className="border border-border rounded-md p-4 bg-card text-left">
                                    <CallAISummaryBullets
                                      callId={call.id}
                                      summary={aiSummaryBlock}
                                      enabled={expandedId === call.id}
                                    />
                                  </div>
                                </div>
                              )}

                              {transcriptToShow && (
                                <div className="space-y-2 text-left">
                                  <div className="flex flex-wrap items-center gap-2 justify-between">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                      Transcript
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-muted-foreground"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toast({
                                            title: "Prompt improvement",
                                            description:
                                              "TODO: add to agent review queue (coming soon).",
                                          });
                                        }}
                                      >
                                        🤖 Prompt Improvement
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs font-normal text-primary"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTranscriptOpen((o) => !o);
                                        }}
                                      >
                                        {transcriptOpen
                                          ? "Hide transcript ▲"
                                          : "View Full Transcript ▼"}
                                      </Button>
                                    </div>
                                  </div>
                                  {transcriptOpen && (
                                    <div className="rounded-md border border-border bg-background p-3 max-h-[min(480px,50vh)] overflow-y-auto text-left">
                                      <TranscriptTwoColumnList
                                        transcript={transcriptToShow}
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Meta grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">Duration</span>
                                  <span className="font-medium">
                                    {call.duration_secs ? `${call.duration_secs}s` : "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">Termination</span>
                                  <span className="font-medium text-sm">
                                    {call.termination_reason || "—"}
                                  </span>
                                </div>
                                {highIntentReasons.length > 0 && (
                                  <div className="col-span-2">
                                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">High Intent Reasons</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {highIntentReasons.map((reason, i) => (
                                        <Badge key={i} variant="outline" className="text-xs bg-background">
                                          {reason}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {carrier && (carrier.usdot || carrier.mc || carrier.company) && (
                                  <div className="col-span-2">
                                    <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">Carrier</span>
                                    <div className="flex items-center gap-2">
                                      <Truck className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">
                                        {carrier.company || "Unknown"}
                                        {carrier.usdot && ` · DOT ${carrier.usdot}`}
                                        {carrier.mc && ` · MC ${carrier.mc}`}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                <Button variant="outline" size="sm" asChild className="gap-1.5">
                                  <Link to={`/calls/${call.id}`} onClick={(e) => e.stopPropagation()}>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Full page
                                  </Link>
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                  ID: {call.conversation_id?.slice(0, 10) || call.id.slice(0, 8)}...
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </div>
          
          {/* Load More / Show All */}
          {calls.length > displayCount && (
            <div className="flex items-center justify-center gap-3 py-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDisplayCount((prev) => prev + 25)}
              >
                Load More ({calls.length - displayCount} remaining)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDisplayCount(calls.length)}
              >
                Show All ({calls.length})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

    </>
  );
};
