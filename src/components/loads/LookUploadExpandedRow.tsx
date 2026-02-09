import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadDetailsGrid, formatLoadNotes } from "./LoadNotes";
import { Copy, Check, Smartphone, Bot, UserCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AIAssistantDrawer } from "@/components/dashboard/AIAssistantDrawer";
import type { Json } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

function findPhoneInUnknown(value: unknown): string | null {
  if (!value) return null;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  const match = str.match(/(\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/);
  return match ? match[1].trim() : null;
}

interface LookUploadExpandedRowProps {
  load: Load;
  onStatusChange: () => void;
}
export function LookUploadExpandedRow({ load, onStatusChange }: LookUploadExpandedRowProps) {
  const [copied, setCopied] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [coveredDialogOpen, setCoveredDialogOpen] = useState(false);

  const handleCopyNotes = async () => {
    const notes = formatLoadNotes(load);
    await navigator.clipboard.writeText(notes);
    setCopied(true);
    toast.success("Notes copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMobileNumber = async () => {
    try {
      const candidates: unknown[] = [
        load.load_call_script,
        load.pickup_location_raw,
        load.dest_location_raw,
        load.source_row,
      ];
      let phone: string | null = null;
      for (const c of candidates) {
        phone = findPhoneInUnknown(c);
        if (phone) break;
      }
      if (!phone) {
        toast.error("No mobile number found for this load");
        return;
      }
      await navigator.clipboard.writeText(phone);
      toast.success("Mobile number copied");
    } catch (error) {
      console.error("Copy mobile number error:", error);
      toast.error("Failed to copy mobile number");
    }
  };

  const handleClaim = async () => {
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("loads")
        .update({
          status: "claimed",
          claimed_by: user?.id ?? null,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", load.id);
      if (error) throw error;
      toast.success("Load claimed");
      onStatusChange();
    } catch (error) {
      console.error("Claim error:", error);
      toast.error("Failed to claim load");
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

  return (
    <>
      <AIAssistantDrawer open={aiOpen} onOpenChange={setAiOpen} agencyId={load.agency_id ?? null} />
      <ConfirmDialog
        open={coveredDialogOpen}
        onOpenChange={setCoveredDialogOpen}
        title="Close Load as Covered"
        description="This load has been covered by another carrier. No callback is needed. This will close the load and any attached lead."
        confirmLabel="Close as Covered"
        onConfirm={handleCloseCovered}
      />

      <div className="bg-muted/20 border-t px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,40%)] text-xs border-[hsl(25,95%,53%)]/30">
              Open
            </Badge>
            {load.is_per_ton && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Per-ton
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">#{load.load_number}</span>
            <span>•</span>
            <span>{load.template_type}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyNotes} className="gap-1.5 h-7 text-xs">
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy Notes
              </>
            )}
          </Button>
        </div>

        <LoadDetailsGrid load={load} />

        {/* Action bar */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <Button size="sm" onClick={handleClaim} disabled={updating} className="gap-1.5 h-8">
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
          <Button size="sm" variant="outline" onClick={handleCopyMobileNumber} className="gap-1.5 h-8">
            <Smartphone className="h-3.5 w-3.5" />
            Mobile Number
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAiOpen(true)} className="gap-1.5 h-8">
            <Bot className="h-3.5 w-3.5" />
            Chat with AI
          </Button>
        </div>
      </div>
    </>
  );
}
