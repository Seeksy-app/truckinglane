import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageCircle, Search, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentProfile } from "@/hooks/useTeamChat";

interface CreateDmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (userIds: string[], groupName?: string) => void;
  isLoading: boolean;
  teamMembers: AgentProfile[];
  currentUserId?: string;
}

export function CreateDmModal({
  open,
  onOpenChange,
  onCreate,
  isLoading,
  teamMembers,
  currentUserId,
}: CreateDmModalProps) {
  const [search, setSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");

  const filteredMembers = teamMembers.filter(m => {
    if (m.id === currentUserId) return false;
    const name = (m.full_name || m.email || "").toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const handleToggleSelect = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreate = () => {
    if (selectedUserIds.length === 0) return;
    const name = selectedUserIds.length > 1 ? groupName.trim() : undefined;
    onCreate(selectedUserIds, name);
    setSelectedUserIds([]);
    setGroupName("");
    setSearch("");
    onOpenChange(false);
  };

  const isGroupChat = selectedUserIds.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              {isGroupChat ? (
                <Users className="h-4 w-4 text-primary" />
              ) : (
                <MessageCircle className="h-4 w-4 text-primary" />
              )}
            </div>
            {isGroupChat ? "Create Group Chat" : "Start a conversation"}
          </DialogTitle>
          <DialogDescription>
            {isGroupChat 
              ? `Select members for your group chat (${selectedUserIds.length} selected)`
              : "Select team members to start a conversation."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Group name input - only show when multiple members selected */}
          {isGroupChat && (
            <Input
              placeholder="Group name (optional)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus={!isGroupChat}
            />
          </div>

          {/* Selected members pills */}
          {selectedUserIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedUserIds.map(userId => {
                const member = teamMembers.find(m => m.id === userId);
                const name = member?.full_name || member?.email?.split("@")[0] || "User";
                return (
                  <button
                    key={userId}
                    onClick={() => handleToggleSelect(userId)}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full hover:bg-primary/20 transition-colors"
                  >
                    {name}
                    <span className="text-primary/60">×</span>
                  </button>
                );
              })}
            </div>
          )}

          <ScrollArea className="h-64 border rounded-lg">
            {filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <p className="text-sm text-muted-foreground">
                  {search ? "No members found" : "No team members available"}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredMembers.map((member) => {
                  const displayName = member.full_name || member.email?.split("@")[0] || "User";
                  const initials = displayName.charAt(0).toUpperCase();
                  const isSelected = selectedUserIds.includes(member.id);

                  return (
                    <button
                      key={member.id}
                      onClick={() => handleToggleSelect(member.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
                        isSelected
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {displayName}
                        </p>
                        {member.email && (
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={selectedUserIds.length === 0 || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isGroupChat ? "Create Group" : "Start Chat"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
