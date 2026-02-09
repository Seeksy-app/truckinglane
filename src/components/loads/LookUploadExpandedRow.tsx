import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadDetailsGrid, formatLoadNotes } from "./LoadNotes";
import { Copy, Check, UserCheck, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Load = Tables<"loads">;

interface LookUploadExpandedRowProps {
  load: Load;
  onStatusChange: () => void;
}

export function LookUploadExpandedRow({ load, onStatusChange }: LookUploadExpandedRowProps) {
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

  const handleClaimLoad = async () => {
    setUpdating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("loads")
        .update({
          status: "claimed",
          claimed_by: user.id,
          claimed_at: now,
        })
        .eq("id", load.id);

      if (error) throw error;
      toast.success("Load claimed");
      onStatusChange();
    } catch (error) {
      console.error("Claim load error:", error);
      toast.error("Failed to claim load");
    } finally {
      setUpdating(false);
    }
  };

  const handleCloseCovered = async () => {
    setUpdating(true);
    setCoveredDialogOpen(false);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("loads")
        .update({
          status: "closed",
          closed_at: now,
          close_reason: "covered",
        })
        .eq("id", load.id);

      if (error) throw error;

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
      <ConfirmDialog
        open={coveredDialogOpen}
        onOpenChange={setCoveredDialogOpen}
        title="Close Load as Covered"
        description="This load has been covered by another carrier. No callback is needed."
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

        {/* Action bar – only open-load buttons; change here without affecting Dashboard */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <Button size="sm" onClick={handleClaimLoad} disabled={updating} className="gap-1.5 h-8">
            <UserCheck className="h-3.5 w-3.5" />
            Mobile Number
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCoveredDialogOpen(true)}
            disabled={updating}
            className="gap-1.5 h-8 border-green-500/30 text-green-700 hover:bg-green-500/10"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Chat With AI
          </Button>
        </div>
      </div>
    </>
  );
}
