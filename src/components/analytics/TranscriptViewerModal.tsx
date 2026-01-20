import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, FileText, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TranscriptViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string | null;
  summary?: string | null;
  summaryTitle?: string | null;
  callInfo?: {
    externalNumber?: string;
    duration?: number;
    outcome?: string;
    createdAt?: string;
  };
}

export const TranscriptViewerModal = ({
  open,
  onOpenChange,
  transcript,
  summary,
  summaryTitle,
  callInfo,
}: TranscriptViewerModalProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyTranscript = async () => {
    if (!transcript) return;
    
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      toast({ title: "Transcript copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="font-serif text-xl">
                {summaryTitle || "Call Transcript"}
              </DialogTitle>
              {callInfo && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {callInfo.externalNumber && (
                    <span className="font-mono">{callInfo.externalNumber}</span>
                  )}
                  {callInfo.duration && (
                    <Badge variant="outline" className="text-xs">
                      {callInfo.duration}s
                    </Badge>
                  )}
                  {callInfo.outcome && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {callInfo.outcome.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4">
          {/* Summary */}
          {summary && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
              <h4 className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-2">
                Summary
              </h4>
              <p className="text-sm text-foreground leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Transcript */}
          <div className="flex-1 min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wide font-medium text-muted-foreground">
                Full Transcript
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleCopyTranscript}
                disabled={!transcript}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            {transcript ? (
              <ScrollArea className="h-[300px] rounded-lg border border-border/50 bg-background p-4">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-mono">
                  {transcript}
                </p>
              </ScrollArea>
            ) : (
              <div className="h-[200px] rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Transcript not available</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
