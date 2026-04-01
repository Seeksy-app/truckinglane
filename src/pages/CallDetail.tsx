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
import { ArrowLeft, Phone } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PhoneDisplay } from "@/components/ui/phone-display";
import { TranscriptTurnsList } from "@/lib/callTranscript";
import { extractTranscriptFromElevenlabsPayload } from "@/lib/elevenlabsPayload";

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { agencyId: userAgencyId } = useUserRole();
  const { impersonatedAgencyId, isImpersonating } = useImpersonation();
  const effectiveAgencyId = isImpersonating ? impersonatedAgencyId : userAgencyId;

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

  const handleBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate("/dashboard");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-2 py-8">
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
        <div className="max-w-3xl mx-auto px-2 py-8">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !call) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-2 py-8">
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-2 py-8">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-serif font-semibold text-foreground">
                {displayTitle}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <Phone className="h-4 w-4 shrink-0" />
                <PhoneDisplay phone={call.external_number} className="text-muted-foreground" />
                <span> · {format(parseISO(call.created_at), "MMM d, yyyy h:mm a")}</span>
                {call.duration_secs != null && ` · ${call.duration_secs}s`}
              </p>
            </div>
            {call.call_outcome && (
              <Badge variant="outline" className="shrink-0">
                {call.call_outcome}
              </Badge>
            )}
          </div>

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
              <CardHeader>
                <CardTitle className="text-base">AI summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {transcriptToShow ? (
                <TranscriptTurnsList transcript={transcriptToShow} />
              ) : (
                <p className="text-sm text-muted-foreground">No transcript available.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
