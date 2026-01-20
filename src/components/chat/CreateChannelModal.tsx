import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Hash } from "lucide-react";

interface CreateChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { name: string; description?: string; isPrivate?: boolean }) => void;
  isLoading: boolean;
}

export function CreateChannelModal({
  open,
  onOpenChange,
  onCreate,
  isLoading,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim() || undefined, isPrivate });
    // Reset form on success
    setName("");
    setDescription("");
    setIsPrivate(false);
    onOpenChange(false);
  };

  const formatChannelName = (value: string) => {
    return value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Hash className="h-4 w-4 text-primary" />
            </div>
            Create a channel
          </DialogTitle>
          <DialogDescription>
            Channels are where your team communicates. They're best organized around a topic.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Channel name</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">#</span>
              <Input
                id="name"
                placeholder="e.g. hot-loads, carrier-issues"
                value={name}
                onChange={(e) => setName(formatChannelName(e.target.value))}
                className="pl-7"
                disabled={isLoading}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and dashes only
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="What's this channel about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <Label htmlFor="private" className="text-sm font-medium">Make private</Label>
              <p className="text-xs text-muted-foreground">Only invited members can see this channel</p>
            </div>
            <Switch
              id="private"
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
              disabled={isLoading}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
