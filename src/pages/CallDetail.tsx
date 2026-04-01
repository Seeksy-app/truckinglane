import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Copy, Check, Phone } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PhoneDisplay } from "@/components/ui/phone-display";
import { TranscriptTwoColumnList } from "@/lib/callTranscript";
import { extractTranscriptFromElevenlabsPayload } from "@/lib/elevenlabsPayload";
import { CallAISummaryBullets } from "@/components/calls/CallAISummaryBullets";
import { toast } from "@/hooks/use-toast";

const leadStatusDetailConfig: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: "Lead", className: "bg-blue-500/15 text-blue-700" },
  claimed: { label: "Claimed", className: "bg-amber-500/15 text-amber-700" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
  booked: { label: "Booked", className: "bg-emerald-500/15 text-emerald-700" },
  none: { label: "No Lead", className: "bg-muted/50 text-muted-foreground" },
};

const outcomeDetailStyles: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-700",
  confirmed: "bg-emerald-500/15 text-emerald-700",
  booked: "bg-emerald-500/15 text-emerald-700",
  declined: "bg-red-500/15 text-red-700",
  callback_requested: "bg-amber-500/15 text-amber-700",
  no_action: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
};

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { agencyId: userAgencyId } = useUserRole();
  const { impersonatedAgencyId, isImpersonating } = useImpersonation();
  const effectiveAgencyId = isImpersonating ? impersonatedAgencyId : userAgencyId;
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const { data: call, isLoading, error, isError } = useQuery({
    queryKey: ["ai_call_detail", id, effectiveAgencyId],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("ai_call_summaries")
        .select(
          "id, created_at, duration_secs, call_outcome, termination_reason, summary_title, summary_short, summary, external_number, conversation_id, is_high_intent, carrier_name, carrier_usdot, transcript",
        )
        .eq("id", id!)
        .eq("agency_id", effectiveAgencyId!)
        .maybeSingle();
      if (qErr) throw qErr;
      return data;
    },
    enabled: !!user && !!id && !!effectiveAgencyId,
  });

  const { data: epcRow } = useQuery({
    queryKey: ["elevenlabs_post_calls", "detail", call?.conversation_id, effectiveAgencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("elevenlabs_post_calls")
        .select("transcript_summary, call_summary_title, payload")
        .eq("conversation_id", call!.conversation_id!)
        .eq("agency_id", effectiveAgencyId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!effectiveAgencyId && !!call?.conversation_id,
  });

  const { data: leadMatch } = useQuery({
    queryKey: ["lead_for_call_detail", effectiveAgencyId, call?.external_number],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("status")
        .eq("agency_id", effectiveAgencyId!)
        .eq("caller_phone", call!.external_number!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled:
      !!user &&
      !!call &&
      !!effectiveAgencyId &&
      !!call.external_number &&
      call.external_number !== "unknown",
  });

  const handleBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate("/dashboard");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto tl-page-gutter py-8">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto tl-page-gutter py-8">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !call) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto tl-page-gutter py-8">
          <Button variant="ghost" onClick={handleBack} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Card>
            <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
              {error instanceof Error ? error.message : "Call not found or you do not have access."}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const epcTranscript = epcRow ? extractTranscriptFromElevenlabsPayload(epcRow.payload) : null;
  const displayTitle =
    epcRow?.call_summary_title?.trim() || call.summary_title || "AI call";
  const aiSummary =
    epcRow?.transcript_summary?.trim() ||
    call.summary?.trim() ||
    call.summary_short?.trim() ||
    null;
  const transcriptToShow = epcTranscript?.trim() || call.transcript?.trim() || null;

  const leadStatusKey = leadMatch?.status ?? "none";
  const leadCfg =
    leadStatusDetailConfig[leadStatusKey] ?? leadStatusDetailConfig.none;
  const outcomeKey = call.call_outcome || "unknown";
  const outcomeCls =
    outcomeDetailStyles[outcomeKey] ?? outcomeDetailStyles.unknown;

  const handleCopySummary = async () => {
    const text =
      epcRow?.transcript_summary?.trim() ||
      call.summary?.trim() ||
      call.summary_short?.trim() ||
      call.summary_title?.trim() ||
      "";
    if (!text) {
      toast({ title: "No summary to copy", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      toast({ title: "Summary copied" });
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto tl-page-gutter py-8">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="space-y-6 text-left">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 w-full min-w-0">
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Badge className={outcomeCls}>{outcomeKey}</Badge>
              <Badge className={leadCfg.className}>{leadCfg.label}</Badge>
            </div>
            <h1 className="text-2xl font-serif font-semibold text-foreground min-w-0 flex-1 truncate">
              {displayTitle}
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySummary}
              className="gap-1.5 text-xs shrink-0 self-end sm:self-center sm:ml-auto"
            >
              {copiedSummary ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Copy Summary
            </Button>
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <Phone className="h-4 w-4 shrink-0" />
            <PhoneDisplay phone={call.external_number} className="text-muted-foreground" />
            <span> · {format(parseISO(call.created_at), "MMM d, yyyy h:mm a")}</span>
            {call.duration_secs != null && ` · ${call.duration_secs}s`}
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wide">Conversation</span>
                <span className="font-mono text-xs break-all">{call.conversation_id}</span>
              </div>
              {call.carrier_name && (
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide">Carrier</span>
                  <span>
                    {call.carrier_name}
                    {call.carrier_usdot ? ` · DOT ${call.carrier_usdot}` : ""}
                  </span>
                </div>
              )}
              {call.termination_reason && (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide">Termination</span>
                  <span>{call.termination_reason}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {aiSummary && (
            <Card>
              <CardHeader className="text-left">
                <CardTitle className="text-base">AI summary</CardTitle>
              </CardHeader>
              <CardContent className="text-left">
                <CallAISummaryBullets callId={call.id} summary={aiSummary} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="text-left space-y-0 pb-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <CardTitle className="text-base">Transcript</CardTitle>
                {transcriptToShow ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() =>
                        toast({
                          title: "Prompt improvement",
                          description:
                            "TODO: add to agent review queue (coming soon).",
                        })
                      }
                    >
                      🤖 Prompt Improvement
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs font-normal text-primary"
                      onClick={() => setTranscriptOpen((o) => !o)}
                    >
                      {transcriptOpen
                        ? "Hide transcript ▲"
                        : "View Full Transcript ▼"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="text-left">
              {transcriptToShow ? (
                transcriptOpen ? (
                  <div className="max-h-[min(480px,55vh)] overflow-y-auto pr-1">
                    <TranscriptTwoColumnList transcript={transcriptToShow} />
                  </div>
                ) : null
              ) : (
                <p className="text-sm text-muted-foreground">
                  No transcript available.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
