import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadDetailsGrid, formatLoadNotes } from "@/components/loads/LoadNotes";
import { Copy, Check, Phone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { getLoadBoardClientPrimaryLabel, getAljexTemplateBadgeLabel } from "@/lib/aljexLoadBoard";

type Load = Tables<"loads">;

interface LookUploadExpandedRowProps {
  load: Load;
  onStatusChange?: () => void;
}

export function LookUploadExpandedRow({ load }: LookUploadExpandedRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyNotes = async () => {
    const notes = formatLoadNotes(load);
    await navigator.clipboard.writeText(notes);
    setCopied(true);
    toast.success("Notes copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMobileNumber = () => {
    const script = load.load_call_script || "";
    const phoneMatch = script.match(/(\+?1?\d{10,11})/);
    if (phoneMatch) {
      navigator.clipboard.writeText(phoneMatch[0]);
      toast.success("Mobile number copied");
    } else {
      toast.info("No mobile number found in load script");
    }
  };

  const sourceLabel = getLoadBoardClientPrimaryLabel(load.template_type);
  const aljexTemplateBadge = getAljexTemplateBadgeLabel(load.template_type);

  return (
    <div className="bg-muted/20 border-t px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/60 pb-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <Badge className="bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,40%)] text-[10px] h-5 px-1.5">
            Open
          </Badge>
          {load.is_per_ton && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
              Per-ton
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-foreground tabular-nums">#{load.load_number}</span>
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

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyNotes}
          className="gap-1 h-7 text-[10px] px-2 shrink-0"
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

      <LoadDetailsGrid load={load} />

      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/50">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopyMobileNumber}
          className="gap-1.5 h-7 text-xs"
        >
          <Phone className="h-3.5 w-3.5" />
          Mobile Number
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => toast.info("Chat with AI coming soon")}
          className="gap-1.5 h-7 text-xs border-green-500/30 text-green-700 hover:bg-green-500/10"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat With AI
        </Button>
      </div>
    </div>
  );
}
