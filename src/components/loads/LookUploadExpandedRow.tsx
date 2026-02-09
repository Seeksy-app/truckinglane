import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadDetailsGrid, formatLoadNotes } from "./LoadNotes";
import { Copy, Check, Smartphone, Bot } from "lucide-react";
import { toast } from "sonner";
import { AIAssistantDrawer } from "@/components/dashboard/AIAssistantDrawer";

type Load = Tables<"loads">;

interface LookUploadExpandedRowProps {
  load: Load;
  onStatusChange: () => void;
}
export function LookUploadExpandedRow({ load, onStatusChange }: LookUploadExpandedRowProps) {
  const [copied, setCopied] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

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

  return (
    <>
      <AIAssistantDrawer open={aiOpen} onOpenChange={setAiOpen} agencyId={load.agency_id ?? null} />

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
          <Button size="sm" onClick={handleCopyMobileNumber} className="gap-1.5 h-8">
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
