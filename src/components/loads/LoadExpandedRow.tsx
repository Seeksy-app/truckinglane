import { useState } from "react";
import { format } from "date-fns";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadDetailsGrid, formatLoadNotes } from "./LoadNotes";
import { MarketRatesSection } from "./MarketRatesSection";
import {
  Copy,
  Check,
  BookOpen,
  X,
  RotateCcw,
  UserCheck,
  Unlock,
  ShieldCheck,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Json } from "@/integrations/supabase/types";
import {
  buildAljexDispatcherCallScript,
  isAljexCallScriptLoad,
  getAljexTemplateBadgeLabel,
  getLoadBoardClientPrimaryLabel,
} from "@/lib/aljexLoadBoard";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Load = Tables<"loads">;

function hasValidDatPosted(datPostedAt: string | null | undefined): boolean {
  if (datPostedAt == null || String(datPostedAt).trim() === "") return false;
  const t = new Date(datPostedAt).getTime();
  return !Number.isNaN(t);
}

function formatDatPostedLine(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Posted to DAT";
  return `Posted to DAT · ${format(d, "MMM d, yyyy h:mm a")}`;
}

interface LoadExpandedRowProps {
  load: Load;
  isDemo?: boolean;
  onStatusChange: () => void;
  /** When true, show DAT + detail link in the expanded header (matches Actions column). */
  enableOpenLoadActions?: boolean;
  onPostToDat?: (e: React.MouseEvent) => void;
  onOpenDetail?: (e: React.MouseEvent) => void;
  datPostingId?: string | null;
  demoDatPostedIds?: Set<string>;
}

export function LoadExpandedRow({
  load,
  isDemo = false,
  onStatusChange,
  enableOpenLoadActions = false,
  onPostToDat,
  onOpenDetail,
  datPostingId = null,
  demoDatPostedIds,
}: LoadExpandedRowProps) {
  const [copied, setCopied] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [coveredDialogOpen, setCoveredDialogOpen] = useState(false);

  const handleCopyNotes = async () => {
    const notes = formatLoadNotes(load);
    await navigator.clipboard.writeText(notes);
    setCopied(true);
    toast.success("Notes copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const dispatcherCallScript = isAljexCallScriptLoad(load.template_type)
    ? buildAljexDispatcherCallScript(load)
    : "";

  const handleCopyCallScript = async () => {
    if (!dispatcherCallScript) return;
    await navigator.clipboard.writeText(dispatcherCallScript);
    setScriptCopied(true);
    toast.success("Call script copied to clipboard");
    setTimeout(() => setScriptCopied(false), 2000);
  };

  const updateStatus = async (newStatus: string, additionalFields: Record<string, unknown> = {}) => {
    if (updating) return;
    setUpdating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const updateData: Record<string, unknown> = { status: newStatus, ...additionalFields };

      if (newStatus === "claimed" && user) {
        updateData.claimed_by = user.id;
        updateData.claimed_at = new Date().toISOString();
      } else if (newStatus === "booked" && user) {
        updateData.booked_by = user.id;
        updateData.booked_at = new Date().toISOString();

        const { data: attribution, error: attrError } = await supabase.rpc(
          "attribute_booking_to_lead",
          {
            _load_id: load.id,
            _agency_id: load.agency_id,
            _lead_id: null,
          },
        );

        if (attrError) {
          console.error("Attribution error:", attrError);
        } else if (
          attribution &&
          typeof attribution === "object" &&
          "matched" in attribution &&
          attribution.matched
        ) {
          const attrResult = attribution as { matched: boolean; match_type?: string };
          toast.success(`AI-attributed booking! Match type: ${attrResult.match_type}`);
        }

        supabase.functions
          .invoke("keyword-analytics", {
            body: {
              action: "generate_suggestions",
              load_id: load.id,
              agency_id: load.agency_id,
            },
          })
          .then(({ data, error }) => {
            if (error) {
              console.error("Keyword suggestion error:", error);
            } else if (data?.added > 0) {
              console.log(`Generated ${data.added} keyword suggestions from booked load`);
            }
          });
      } else if (newStatus === "closed") {
        updateData.closed_at = new Date().toISOString();
      } else if (newStatus === "open") {
        updateData.claimed_by = null;
        updateData.claimed_at = null;
        updateData.booked_by = null;
        updateData.booked_at = null;
        updateData.closed_at = null;
        updateData.close_reason = null;
        updateData.booked_source = "manual";
        updateData.booked_lead_id = null;
        updateData.booked_call_id = null;
      }

      const { error } = await supabase.from("loads").update(updateData).eq("id", load.id);

      if (error) throw error;

      const statusMessages: Record<string, string> = {
        claimed: "claimed",
        booked: "booked",
        closed: "closed",
        open: "released",
      };
      toast.success(`Load ${statusMessages[newStatus] || newStatus}`);
      onStatusChange();
    } catch (error) {
      console.error("Status update error:", error);
      toast.error("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleCloseCovered = async () => {
    setUpdating(true);
    setCoveredDialogOpen(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const now = new Date().toISOString();

      const { error: loadError } = await supabase
        .from("loads")
        .update({
          status: "closed",
          closed_at: now,
          close_reason: "covered",
        })
        .eq("id", load.id);

      if (loadError) throw loadError;

      if (load.booked_lead_id) {
        await supabase
          .from("leads")
          .update({
            status: "closed",
            closed_at: now,
            close_reason: "covered",
          })
          .eq("id", load.booked_lead_id)
          .neq("status", "booked")
          .neq("status", "closed");

        const eventMeta = { load_id: load.id, close_reason: "covered" } as unknown as Json;
        supabase
          .from("lead_events")
          .insert([
            {
              lead_id: load.booked_lead_id,
              agent_id: user?.id,
              event_type: "closed_as_covered",
              meta: eventMeta,
            },
          ])
          .then(() => {});
      }

      toast.success("Load closed as covered");
      onStatusChange();
    } catch (error) {
      console.error("Close covered error:", error);
      toast.error("Failed to close load");
    } finally {
      setUpdating(false);
    }
  };

  const statusStyles: Record<string, string> = {
    open: "bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,40%)]",
    claimed: "bg-[hsl(210,80%,50%)]/15 text-[hsl(210,80%,40%)]",
    booked: "bg-[hsl(145,63%,42%)]/15 text-[hsl(145,63%,32%)]",
    closed: "bg-muted text-muted-foreground",
  };

  const getStatusLabel = () => {
    if (load.status === "closed" && load.close_reason === "covered") {
      return "Covered";
    }
    const labels: Record<string, string> = {
      open: "Open",
      claimed: "Claimed",
      booked: "Booked",
      closed: "Closed",
    };
    return labels[load.status] || load.status;
  };

  const serverPosted = (load as { dat_posted_at?: string | null }).dat_posted_at;
  const isDatPosted =
    hasValidDatPosted(serverPosted) || (isDemo && demoDatPostedIds?.has(load.id));
  const postedIso = hasValidDatPosted(serverPosted) ? String(serverPosted) : null;
  const aljexTemplateBadge = getAljexTemplateBadgeLabel(load.template_type);
  const sourceLabel = getLoadBoardClientPrimaryLabel(load.template_type);

  return (
    <>
      <ConfirmDialog
        open={coveredDialogOpen}
        onOpenChange={setCoveredDialogOpen}
        title="Close Load as Covered"
        description="This load has been covered by another carrier. No callback is needed. This will close the load and any attached lead."
        confirmLabel="Close as Covered"
        onConfirm={handleCloseCovered}
      />

      <div className="bg-muted/20 border-t px-3 py-2 space-y-2">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/60 pb-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <Badge className={`${statusStyles[load.status] || statusStyles.open} text-[10px] h-5 px-1.5`}>
              {getStatusLabel()}
            </Badge>
            {load.is_per_ton && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
                Per-ton
              </Badge>
            )}
            {load.close_reason === "covered" && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-1.5 bg-green-500/10 text-green-700 border-green-500/30"
              >
                <ShieldCheck className="h-3 w-3 mr-0.5" />
                Covered
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-foreground tabular-nums">
              #{load.load_number}
            </span>
            <Badge variant="outline" className="text-[10px] font-medium h-5 px-1.5 shrink-0">
              {sourceLabel}
            </Badge>
            {aljexTemplateBadge ? (
              <Badge
                variant="secondary"
                className="h-5 px-1 py-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0"
              >
                {aljexTemplateBadge}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1 justify-end shrink-0">
            {enableOpenLoadActions && onPostToDat ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 px-1.5 text-[10px] font-semibold shrink-0",
                      isDatPosted
                        ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white"
                        : "border-amber-400/70 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                    )}
                    disabled={datPostingId === load.id || isDatPosted}
                    onClick={(e) => onPostToDat(e)}
                  >
                    {datPostingId === load.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isDatPosted ? (
                      "DAT ✓"
                    ) : (
                      "DAT"
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isDatPosted
                    ? postedIso
                      ? formatDatPostedLine(postedIso)
                      : "Posted to DAT (demo)"
                    : "Not posted to DAT yet"}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {enableOpenLoadActions && onOpenDetail ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => onOpenDetail(e)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View Details</TooltipContent>
              </Tooltip>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyNotes}
              className="gap-1 h-7 text-[10px] px-2"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy Notes
                </>
              )}
            </Button>
          </div>
        </div>

        <LoadDetailsGrid load={load} />

        <MarketRatesSection load={load} />

        {dispatcherCallScript ? (
          <div className="rounded-md border border-border bg-background/50 p-2 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Call script
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyCallScript}
                className="h-7 gap-1 text-[10px] px-2"
                aria-label="Copy call script to clipboard"
              >
                {scriptCopied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy Script
                  </>
                )}
              </Button>
            </div>
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-snug m-0">
              {dispatcherCallScript}
            </pre>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/50">
          {load.status === "open" && !isDemo && (
            <>
              <Button
                size="sm"
                onClick={() => updateStatus("claimed")}
                disabled={updating}
                className="gap-1.5 h-7 text-xs"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Claim Load
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCoveredDialogOpen(true)}
                disabled={updating}
                className="gap-1.5 h-7 text-xs border-green-500/30 text-green-700 hover:bg-green-500/10"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Close as Covered
              </Button>
            </>
          )}

          {load.status === "claimed" && (
            <>
              <Button
                size="sm"
                onClick={() => updateStatus("booked")}
                disabled={updating}
                className="gap-1.5 h-7 text-xs"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Book Load
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCoveredDialogOpen(true)}
                disabled={updating}
                className="gap-1.5 h-7 text-xs border-green-500/30 text-green-700 hover:bg-green-500/10"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Close as Covered
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateStatus("closed")}
                disabled={updating}
                className="gap-1.5 h-7 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus("open")}
                disabled={updating}
                className="gap-1.5 h-7 text-xs"
              >
                <Unlock className="h-3.5 w-3.5" />
                Release
              </Button>
            </>
          )}

          {load.status === "booked" && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateStatus("closed")}
                disabled={updating}
                className="gap-1.5 h-7 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus("open")}
                disabled={updating}
                className="gap-1.5 h-7 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-open
              </Button>
            </>
          )}

          {load.status === "closed" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateStatus("open")}
              disabled={updating}
              className="gap-1.5 h-7 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Re-open
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
