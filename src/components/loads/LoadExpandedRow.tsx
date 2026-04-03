import { useState } from "react";
import { format } from "date-fns";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatLoadNotes,
  formatCityState,
  formatRateDisplay,
  formatCurrency,
  getCommodityDisplay,
} from "./LoadNotes";
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

const labelSm = "text-[11px] font-medium uppercase tracking-wider text-[#6B7280] [font-variant:small-caps]";
const valEmphasis = "text-sm font-semibold text-[#111827]";
const valMuted = "text-sm text-[#6B7280]";

function ExpandedField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className={labelSm}>{label}</div>
      <div className={cn(valEmphasis, "break-words")}>{children}</div>
    </div>
  );
}

interface LoadExpandedRowProps {
  load: Load;
  isDemo?: boolean;
  onStatusChange: () => void;
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
  const callScriptText =
    dispatcherCallScript.trim() || load.load_call_script?.trim() || "";

  const handleCopyCallScript = async () => {
    if (!callScriptText) return;
    await navigator.clipboard.writeText(callScriptText);
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

  const pickup = formatCityState(load.pickup_city, load.pickup_state) || "—";
  const delivery = formatCityState(load.dest_city, load.dest_state) || "—";
  const routeTitle = `${pickup.toUpperCase()} → ${delivery.toUpperCase()}`;

  const tarpsDisplay = load.tarps
    ? load.tarp_size
      ? `${load.tarps} (${load.tarp_size})`
      : String(load.tarps)
    : null;
  const trailerTypeLine = [load.trailer_type, tarpsDisplay].filter(Boolean).join(" · ") || "—";
  const weightLine =
    load.weight_lbs != null ? `${load.weight_lbs.toLocaleString()} lbs` : "—";
  const commodityDisplay = getCommodityDisplay(load) ?? "—";

  const rateStr = formatRateDisplay(load) ?? "—";
  const targetPayStr = formatCurrency(load, load.target_pay) ?? "—";
  const maxPayStr = formatCurrency(load, load.max_pay) ?? "—";

  const outlineBtn =
    "border border-[#F3F4F6] bg-white text-[#111827] shadow-none hover:bg-[#F9FAFB]";
  const copyNotesBtn =
    "border border-[#E5E7EB] bg-white text-[#111827] shadow-none hover:bg-[#F9FAFB]";

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

      <div className="px-3 py-3 border-t border-[#E5E7EB] bg-[#F9FAFB]">
        <div
          className={cn(
            "relative rounded-[12px] bg-[#FFFFFF] p-5 pt-6",
            "shadow-[0_2px_12px_rgba(0,0,0,0.08)]",
            "border border-[#E5E7EB]",
          )}
        >
          {/* Status + per-ton: top right */}
          <div className="absolute top-4 right-5 z-10 flex flex-wrap items-center justify-end gap-2">
            {load.is_per_ton ? (
              <span className="inline-flex items-center rounded-full border border-[#E5E7EB] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#374151]">
                Per-ton
              </span>
            ) : null}
            {load.status === "open" ? (
              <span className="inline-flex items-center rounded-full bg-[#F97316] px-3 py-1 text-sm font-semibold text-white shadow-none">
                {getStatusLabel()}
              </span>
            ) : (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold",
                  load.status === "claimed" && "bg-[#EFF6FF] text-[#1E40AF]",
                  load.status === "booked" && "bg-[#ECFDF5] text-[#047857]",
                  load.status === "closed" && "bg-[#F3F4F6] text-[#374151]",
                )}
              >
                {getStatusLabel()}
              </span>
            )}
          </div>

          {/* Header: load # + badges (leave room for status top-right) */}
          <div className="flex flex-wrap items-start justify-between gap-2 pr-[min(12rem,36%)] mb-4">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-sm font-semibold tabular-nums text-[#111827]">
                #{load.load_number}
              </span>
              <Badge variant="outline" className="text-[10px] font-medium h-6 px-2 border-[#E5E7EB] text-[#374151] bg-white">
                {sourceLabel}
              </Badge>
              {aljexTemplateBadge ? (
                <Badge
                  variant="secondary"
                  className="h-6 px-2 py-0 text-[9px] font-semibold uppercase tracking-wide text-[#6B7280] bg-[#F3F4F6] border-0"
                >
                  {aljexTemplateBadge}
                </Badge>
              ) : null}
              {load.close_reason === "covered" && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-6 px-2 border-[#BBF7D0] bg-[#F0FDF4] text-[#166534] gap-0.5 inline-flex items-center"
                >
                  <ShieldCheck className="h-3 w-3 shrink-0" />
                  Covered
                </Badge>
              )}
            </div>
            {enableOpenLoadActions && onOpenDetail ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0 text-[#6B7280] hover:text-[#111827]"
                    onClick={(e) => onOpenDetail(e)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View Details</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          {/* Origin → Destination — centered */}
          <h3 className="text-center text-[20px] font-bold leading-snug text-[#1A1A1A] tracking-tight px-2">
            {routeTitle}
          </h3>

          {/* Three columns — financials only in col 3; no duplicate status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 mt-6">
            <div className="flex flex-col gap-4 min-w-0">
              <ExpandedField label="Ship Date">{load.ship_date ?? "—"}</ExpandedField>
              <ExpandedField label="Pickup">{pickup}</ExpandedField>
              <ExpandedField label="Delivery">{delivery}</ExpandedField>
            </div>
            <div className="flex flex-col gap-4 min-w-0">
              <ExpandedField label="Trailer Type">{trailerTypeLine}</ExpandedField>
              <ExpandedField label="Weight">{weightLine}</ExpandedField>
              <ExpandedField label="Commodity">{commodityDisplay}</ExpandedField>
            </div>
            <div className="flex flex-col gap-5 min-w-0">
              <div className="flex flex-col gap-1">
                <div className={labelSm}>Rate</div>
                <div className={valMuted}>{rateStr}</div>
              </div>
              <div className="flex flex-col gap-1">
                <div className={labelSm}>Target Pay</div>
                <div className="text-3xl font-bold tabular-nums leading-tight tracking-tight text-[#111827]">
                  {targetPayStr}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className={labelSm}>Max Pay</div>
                <div className={valMuted}>{maxPayStr}</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <MarketRatesSection load={load} tone="neutral" />
          </div>

          <div className="my-5 h-px w-full bg-[#F3F4F6]" aria-hidden />

          {callScriptText ? (
            <div className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] font-medium tracking-wider text-[#6B7280] [font-variant:small-caps]">
                  CALL SCRIPT
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCallScript}
                  className={cn("h-8 gap-1 text-xs shrink-0", copyNotesBtn)}
                  aria-label="Copy call script to clipboard"
                >
                  {scriptCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Script
                    </>
                  )}
                </Button>
              </div>
              <pre className="text-sm font-sans leading-relaxed text-[#111827] whitespace-pre-wrap m-0">
                {callScriptText}
              </pre>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-4">
            {load.status === "open" && !isDemo && (
              <>
                <Button
                  size="sm"
                  onClick={() => updateStatus("claimed")}
                  disabled={updating}
                  className="h-9 gap-1.5 bg-[#F97316] text-white shadow-none hover:bg-[#ea580c]"
                >
                  <UserCheck className="h-4 w-4" />
                  Claim Load
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCoveredDialogOpen(true)}
                  disabled={updating}
                  className={cn("h-9 gap-1.5 shadow-none", outlineBtn)}
                >
                  <ShieldCheck className="h-4 w-4" />
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
                  className="h-9 gap-1.5 bg-[#F97316] text-white shadow-none hover:bg-[#ea580c]"
                >
                  <BookOpen className="h-4 w-4" />
                  Book Load
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCoveredDialogOpen(true)}
                  disabled={updating}
                  className={cn("h-9 gap-1.5 shadow-none", outlineBtn)}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Close as Covered
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("closed")}
                  disabled={updating}
                  className={cn("h-9 gap-1.5 shadow-none", outlineBtn)}
                >
                  <X className="h-4 w-4" />
                  Close
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("open")}
                  disabled={updating}
                  className={cn("h-9 gap-1.5 shadow-none", outlineBtn)}
                >
                  <Unlock className="h-4 w-4" />
                  Release
                </Button>
              </>
            )}

            {load.status === "booked" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("closed")}
                  disabled={updating}
                  className={cn("h-9 gap-1.5 shadow-none", outlineBtn)}
                >
                  <X className="h-4 w-4" />
                  Close
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("open")}
                  disabled={updating}
                  className={cn("h-9 gap-1.5 shadow-none", outlineBtn)}
                >
                  <RotateCcw className="h-4 w-4" />
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
                className={cn("h-9 gap-1.5 shadow-none", outlineBtn)}
              >
                <RotateCcw className="h-4 w-4" />
                Re-open
              </Button>
            )}

            {enableOpenLoadActions && onPostToDat ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    className={cn(
                      "h-9 px-3 text-sm font-semibold shadow-none",
                      isDatPosted
                        ? "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white"
                        : "border border-[#1F2937] bg-[#1F2937] text-white hover:bg-[#111827]",
                    )}
                    disabled={datPostingId === load.id || isDatPosted}
                    onClick={(e) => onPostToDat(e)}
                  >
                    {datPostingId === load.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
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

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyNotes}
              className={cn("h-9 gap-1.5 text-sm shadow-none", copyNotesBtn)}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Notes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
