import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadDetailsGrid, formatLoadNotes } from "./LoadNotes";
import { Copy, Check, BookOpen, X, RotateCcw, UserCheck, Unlock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Json } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

interface LoadExpandedRowProps {
  load: Load;
  isDemo?: boolean;
  onStatusChange: () => void;
}

export function LoadExpandedRow({ load, isDemo = false, onStatusChange }: LoadExpandedRowProps) {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [coveredDialogOpen, setCoveredDialogOpen] = useState(false);

  const handleCopyNotes = async () => {
    const notes = formatLoadNotes(load);
    await navigator.clipboard.writeText(notes);
    setCopied(true);
    toast.success("Notes copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const updateStatus = async (newStatus: string, additionalFields: Record<string, unknown> = {}) => {
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const updateData: Record<string, unknown> = { status: newStatus, ...additionalFields };
      
      if (newStatus === "claimed" && user) {
        updateData.claimed_by = user.id;
        updateData.claimed_at = new Date().toISOString();
      } else if (newStatus === "booked" && user) {
        updateData.booked_by = user.id;
        updateData.booked_at = new Date().toISOString();
        
        const { data: attribution, error: attrError } = await supabase
          .rpc('attribute_booking_to_lead', {
            _load_id: load.id,
            _agency_id: load.agency_id,
            _lead_id: null
          });
        
        if (attrError) {
          console.error("Attribution error:", attrError);
        } else if (attribution && typeof attribution === 'object' && 'matched' in attribution && attribution.matched) {
          const attrResult = attribution as { matched: boolean; match_type?: string };
          toast.success(`AI-attributed booking! Match type: ${attrResult.match_type}`);
        }

        // Generate keyword suggestions from the booked load
        supabase.functions.invoke('keyword-analytics', {
          body: {
            action: 'generate_suggestions',
            load_id: load.id,
            agency_id: load.agency_id,
          }
        }).then(({ data, error }) => {
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
        updateData.booked_source = 'manual';
        updateData.booked_lead_id = null;
        updateData.booked_call_id = null;
      }

      const { error } = await supabase
        .from("loads")
        .update(updateData)
        .eq("id", load.id);

      if (error) throw error;

      const statusMessages: Record<string, string> = {
        claimed: "claimed",
        booked: "booked", 
        closed: "closed",
        open: "released"
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
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      
      // Close the load as covered
      const { error: loadError } = await supabase
        .from("loads")
        .update({
          status: "closed",
          closed_at: now,
          close_reason: "covered",
        })
        .eq("id", load.id);

      if (loadError) throw loadError;

      // If there's an attached lead, close it too
      if (load.booked_lead_id) {
        await supabase
          .from("leads")
          .update({
            status: "closed",
            closed_at: now,
            close_reason: "covered",
          })
          .eq("id", load.booked_lead_id)
          .neq("status", "booked") // Don't close already booked leads
          .neq("status", "closed"); // Don't double-close

        // Log lead event (fire-and-forget)
        const eventMeta = { load_id: load.id, close_reason: "covered" } as unknown as Json;
        supabase.from("lead_events").insert([{
          lead_id: load.booked_lead_id,
          agent_id: user?.id,
          event_type: "closed_as_covered",
          meta: eventMeta,
        }]).then(() => {});
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
      
      <div className="bg-muted/20 border-t px-4 py-3 space-y-3">
        {/* Compact Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge className={`${statusStyles[load.status] || statusStyles.open} text-xs`}>
              {getStatusLabel()}
            </Badge>
            {load.is_per_ton && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Per-ton
              </Badge>
            )}
            {load.close_reason === "covered" && (
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/30">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Covered
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">#{load.load_number}</span>
            <span>•</span>
            <span>{load.template_type}</span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyNotes}
            className="gap-1.5 h-7 text-xs"
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

        {/* Compact Details Grid */}
        <LoadDetailsGrid load={load} />

        {/* Action Bar */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          {load.status === "open" && !isDemo && (
            <>
              <Button
                size="sm"
                onClick={() => updateStatus("claimed")}
                disabled={updating}
                className="gap-1.5 h-8"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Claim Load
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCoveredDialogOpen(true)}
                disabled={updating}
                className="gap-1.5 h-8 border-green-500/30 text-green-700 hover:bg-green-500/10"
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
                className="gap-1.5 h-8"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Book Load
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCoveredDialogOpen(true)}
                disabled={updating}
                className="gap-1.5 h-8 border-green-500/30 text-green-700 hover:bg-green-500/10"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Close as Covered
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateStatus("closed")}
                disabled={updating}
                className="gap-1.5 h-8"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus("open")}
                disabled={updating}
                className="gap-1.5 h-8"
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
                className="gap-1.5 h-8"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus("open")}
                disabled={updating}
                className="gap-1.5 h-8"
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
              className="gap-1.5 h-8"
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
