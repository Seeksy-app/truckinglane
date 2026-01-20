import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Hash, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatChannel } from "@/hooks/useTeamChat";

interface ShareToChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShare: (channelId: string) => void;
  isLoading: boolean;
  channels: ChatChannel[];
  objectType: "lead" | "load" | "carrier" | "ai_suggestion";
  objectTitle: string;
}

export function ShareToChatModal({
  open,
  onOpenChange,
  onShare,
  isLoading,
  channels,
  objectType,
  objectTitle,
}: ShareToChatModalProps) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const typeLabels: Record<string, string> = {
    lead: "Lead",
    load: "Load",
    carrier: "Carrier",
    ai_suggestion: "AI Suggestion",
  };

  const typeEmojis: Record<string, string> = {
    lead: "📞",
    load: "📦",
    carrier: "🚛",
    ai_suggestion: "🤖",
  };

  const regularChannels = channels.filter(c => !c.is_dm);

  const handleShare = () => {
    if (!selectedChannelId) return;
    onShare(selectedChannelId);
    setSelectedChannelId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Send className="h-4 w-4 text-primary" />
            </div>
            Share to Team Chat
          </DialogTitle>
          <DialogDescription>
            Select a channel to share this {typeLabels[objectType]?.toLowerCase() || "item"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preview */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Preview</p>
            <div className="flex items-center gap-2">
              <span className="text-lg">{typeEmojis[objectType] || "📄"}</span>
              <span className="text-sm font-medium">{typeLabels[objectType]}: {objectTitle}</span>
            </div>
          </div>

          {/* Channel selector */}
          <div>
            <p className="text-sm font-medium mb-2">Choose a channel</p>
            <ScrollArea className="h-48 border rounded-lg">
              {regularChannels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <p className="text-sm text-muted-foreground">No channels available</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {regularChannels.map((channel) => {
                    const isSelected = selectedChannelId === channel.id;

                    return (
                      <button
                        key={channel.id}
                        onClick={() => setSelectedChannelId(channel.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors text-left",
                          isSelected
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted"
                        )}
                      >
                        <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground">{channel.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={!selectedChannelId || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
