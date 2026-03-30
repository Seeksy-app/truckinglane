import { Fragment, useState } from "react";
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
import { TranscriptTurnsList } from "@/lib/callTranscript";
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

export const DashboardCallsTable = ({ calls, loading }: DashboardCallsTableProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Time</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Duration</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Call Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Lead Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Title</TableHead>
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
                        <TableCell className="text-sm">
                          <PhoneDisplay
                            phone={phoneNumber}
                            className="font-semibold text-[0.95rem]"
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {call.duration_secs ? `${call.duration_secs}s` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={outcomeStyles[call.call_outcome || 'unknown'] || outcomeStyles.unknown}>
                            {call.call_outcome || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const status = call.lead_status || 'none';
                            const config = leadStatusConfig[status] || leadStatusConfig.none;
                            return (
                              <Badge className={config.className}>
                                {config.label}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            {highIntent && <Flame className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                            <Link
                              to={`/calls/${call.id}`}
                              className="truncate hover:underline text-primary"
                              title="Open call detail"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {displayTitle || "—"}
                            </Link>
                            <Link
                              to={`/calls/${call.id}`}
                              className="flex-shrink-0 text-muted-foreground hover:text-foreground"
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
                            <div className="p-5 border-t border-border/50 space-y-4">
                              {/* Top row: Title + badges */}
                              <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                  <h4 className="font-semibold text-foreground">
                                    {displayTitle || call.summary_title || "Call Summary"}
                                  </h4>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={outcomeStyles[outcome] || outcomeStyles.unknown}>
                                      {outcome}
                                    </Badge>
                                    {highIntent && (
                                      <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1">
                                        <Flame className="h-3 w-3" />
                                        High Intent
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopySummary(call);
                                  }}
                                  className="gap-1.5 text-xs"
                                >
                                  {copiedId === call.id ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                  Copy Summary
                                </Button>
                              </div>
                              
                              {/* AI summary + transcript */}
                              {aiSummaryBlock && (
                                <div className="space-y-1">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    AI summary
                                  </p>
                                  <div className="bg-card border border-border rounded-md p-4">
                                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                      {aiSummaryBlock}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {transcriptToShow && (
                                <div className="space-y-2">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Transcript
                                  </p>
                                  <div className="rounded-md border border-border bg-background p-3 max-h-[min(480px,50vh)] overflow-y-auto">
                                    <TranscriptTurnsList transcript={transcriptToShow} />
                                  </div>
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
