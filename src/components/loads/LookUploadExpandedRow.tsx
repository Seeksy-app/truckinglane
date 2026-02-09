import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadDetailsGrid, formatLoadNotes } from "@/components/loads/LoadNotes";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

type Load = Tables<"loads">;

interface LookUploadExpandedRowProps {
  load: Load;
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

  return (
    <div className="bg-muted/20 border-t px-4 py-3 space-y-3">
      {/* Compact Header Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,40%)] text-xs">
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
            </>
          )}
    </div>
  );
}
