import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { 
  ChevronRight, 
  Hash,
  MessageCircle,
  AtSign,
  Users,
  Search,
  X,
  GripVertical,
  Send,
  Loader2,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useTeamChat, ChatMessage, AgentProfile } from "@/hooks/useTeamChat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { CreateChannelModal } from "@/components/chat/CreateChannelModal";
import { CreateDmModal } from "@/components/chat/CreateDmModal";

interface InternalChatRailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
}

const COLLAPSED_WIDTH = 56;

export function InternalChatRail({ 
  open, 
  onOpenChange, 
  width, 
  onWidthChange 
}: InternalChatRailProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateDm, setShowCreateDm] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch profile for avatar
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  const userInitial = (profile?.full_name || user?.email || "U").charAt(0).toUpperCase();

  const {
    channels,
    channelsLoading,
    messages,
    messagesLoading,
    activeChannelId,
    selectChannel,
    sendMessage,
    isSending,
    createChannel,
    isCreatingChannel,
    createDm,
    isCreatingDm,
    teamMembers,
  } = useTeamChat();

  // Separate channels and DMs
  const regularChannels = channels.filter(c => !c.is_dm);
  const dmChannels = channels.filter(c => c.is_dm);

  const totalUnread = channels.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const hasMentions = totalUnread > 0;

  const filteredChannels = searchQuery
    ? regularChannels.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : regularChannels;

  const filteredDms = searchQuery
    ? dmChannels.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : dmChannels;

  const activeChannel = channels.find(c => c.id === activeChannelId);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when channel is selected
  useEffect(() => {
    if (activeChannelId && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeChannelId]);

  // Handle message submission
  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim() || isSending) return;
    
    sendMessage({ 
      body: messageInput.trim(), 
      mentions: selectedMentions 
    });
    setMessageInput("");
    setSelectedMentions([]);
  }, [messageInput, isSending, sendMessage, selectedMentions]);

  // Handle keyboard events in input
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === "@") {
      setShowMentions(true);
      setMentionFilter("");
    } else if (e.key === "Escape") {
      setShowMentions(false);
    }
  };

  // Handle input change for @mentions
  const handleInputChange = (value: string) => {
    setMessageInput(value);
    
    // Check for @ at cursor position
    const atIndex = value.lastIndexOf("@");
    if (atIndex !== -1) {
      const afterAt = value.substring(atIndex + 1);
      if (!afterAt.includes(" ")) {
        setMentionFilter(afterAt.toLowerCase());
        setShowMentions(true);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  // Insert mention
  const insertMention = (member: AgentProfile) => {
    const atIndex = messageInput.lastIndexOf("@");
    const beforeAt = messageInput.substring(0, atIndex);
    const displayName = member.full_name || member.email || "User";
    setMessageInput(`${beforeAt}@${displayName} `);
    setSelectedMentions([...selectedMentions, member.id]);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  // Filter team members for mention popup
  const filteredMembers = teamMembers.filter(m => {
    const name = (m.full_name || m.email || "").toLowerCase();
    return name.includes(mentionFilter) && m.id !== user?.id;
  });

  // Resize handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  const formatMessageTime = (date: string) => {
    const d = new Date(date);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
    return format(d, "MMM d, h:mm a");
  };

  const renderMessage = (message: ChatMessage) => {
    const isOwn = message.sender_id === user?.id;
    const senderName = message.sender?.full_name || message.sender?.email?.split("@")[0] || "User";
    const initials = senderName.charAt(0).toUpperCase();

    return (
      <div
        key={message.id}
        className={cn(
          "group flex gap-2.5 px-3 py-1.5 hover:bg-[#2c2f33]/50 transition-colors",
          isOwn && "flex-row-reverse"
        )}
      >
        <div className="h-8 w-8 rounded-full bg-[#2c2f33] flex items-center justify-center text-xs font-semibold text-white shrink-0">
          {initials}
        </div>
        <div className={cn("flex-1 min-w-0", isOwn && "text-right")}>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-white">{senderName}</span>
            <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatMessageTime(message.created_at)}
            </span>
          </div>
          <p className="text-sm text-gray-200 break-words whitespace-pre-wrap">
            {message.body}
          </p>
        </div>
      </div>
    );
  };

  // Handle Escape key and keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // ⌘⇧K or Ctrl+Shift+K to toggle
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      // Escape to close
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  return (
    <TooltipProvider>
      {/* Backdrop overlay - closes rail on click */}
      {open && (
        <div 
          className="fixed inset-0 z-30" 
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "fixed top-0 left-0 h-full z-40 flex transition-all duration-300 ease-out",
          isResizing && "select-none"
        )}
        style={{ 
          width: open ? width : COLLAPSED_WIDTH,
          transform: "translateX(0)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Collapse handle - always visible when collapsed */}
        {!open && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onOpenChange(true)}
                className={cn(
                  "h-full w-full flex flex-col items-center justify-center gap-2",
                  "bg-[#1a1d21] border-r border-[#2c2f33] shadow-lg",
                  "hover:bg-[#2c2f33] transition-colors"
                )}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={cn(
                    "relative",
                    hasMentions && "animate-pulse"
                  )}>
                    <Avatar className="h-12 w-12 ring-2 ring-[#2c2f33]">
                      <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || "Profile"} />
                      <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-base">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                    {totalUnread > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[#1a1d21]">
                        {totalUnread > 9 ? "9+" : totalUnread}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Open Team Chat (⌘⇧K)</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Main rail content */}
        {open && (
          <div 
            className={cn(
              "w-full h-full flex flex-col",
              "bg-[#1a1d21] border-r border-[#2c2f33] shadow-xl"
            )}
          >
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-[#2c2f33] bg-[#1a1d21]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-[#2c2f33] flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white">Team Chat</h2>
                      <div className="h-2 w-2 rounded-full bg-emerald-500" title="Connected" />
                    </div>
                    <p className="text-[10px] text-gray-400">⌘⇧K to toggle</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#2c2f33]"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* If channel is selected, show messages */}
            {activeChannel ? (
              <>
                {/* Channel header */}
                <div className="flex-shrink-0 px-4 py-3 border-b border-[#2c2f33] bg-[#1a1d21]">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-gray-400 hover:text-white hover:bg-[#2c2f33]"
                      onClick={() => selectChannel("")}
                    >
                      ←
                    </Button>
                    {activeChannel.is_dm ? (
                      <div className="h-6 w-6 rounded-full bg-[#2c2f33] flex items-center justify-center text-xs font-semibold text-white">
                        {activeChannel.name.charAt(0)}
                      </div>
                    ) : (
                      <Hash className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-sm font-semibold text-white">{activeChannel.name}</span>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 bg-[#1a1d21]">
                  <div className="py-3">
                    {messagesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                        {activeChannel.is_dm ? (
                          <MessageCircle className="h-8 w-8 text-gray-500 mb-2" />
                        ) : (
                          <Hash className="h-8 w-8 text-gray-500 mb-2" />
                        )}
                        <p className="text-sm text-gray-400">
                          No messages yet. Be the first to say something!
                        </p>
                      </div>
                    ) : (
                      messages.map(renderMessage)
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Message composer */}
                <div className="flex-shrink-0 p-3 border-t border-[#2c2f33] bg-[#1a1d21]">
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      placeholder={`Message ${activeChannel.is_dm ? activeChannel.name : "#" + activeChannel.name}`}
                      value={messageInput}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="pr-10 bg-[#2c2f33] border-[#3f4248] text-white placeholder:text-gray-400"
                      disabled={isSending}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-gray-400 hover:text-white hover:bg-[#3f4248]"
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || isSending}
                    >
                      {isSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>

                    {/* Mention popup */}
                    {showMentions && filteredMembers.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#2c2f33] border border-[#3f4248] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filteredMembers.map(member => (
                          <button
                            key={member.id}
                            onClick={() => insertMention(member)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#3f4248] text-left"
                          >
                            <div className="h-6 w-6 rounded-full bg-[#3f4248] flex items-center justify-center text-xs font-semibold text-white">
                              {(member.full_name || member.email || "U").charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-gray-200">
                              {member.full_name || member.email}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    Press Enter to send • @ to mention
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Channel list view */}
                {/* Search */}
                <div className="flex-shrink-0 p-3 border-b border-[#2c2f33]">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 pl-8 text-sm bg-[#2c2f33] border-[#3f4248] text-white placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <ScrollArea className="flex-1 bg-[#1a1d21]">
                  <div className="p-3 space-y-5">
                    {/* Loading state */}
                    {channelsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    )}

                    {/* Empty state */}
                    {!channelsLoading && channels.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                        <MessageCircle className="h-8 w-8 text-gray-500 mb-2" />
                        <p className="text-sm text-gray-400 mb-3">
                          No channels yet. Create one to get started!
                        </p>
                        <Button size="sm" onClick={() => setShowCreateChannel(true)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Create Channel
                        </Button>
                      </div>
                    )}

                    {/* Channels */}
                    {!channelsLoading && (filteredChannels.length > 0 || regularChannels.length === 0) && (
                      <div>
                        <div className="flex items-center justify-between px-2 py-1.5">
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            Channels
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-gray-400 hover:text-white hover:bg-[#2c2f33]"
                                onClick={() => setShowCreateChannel(true)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>Create channel</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="space-y-0.5">
                          {filteredChannels.map((channel) => (
                            <button
                              key={channel.id}
                              onClick={() => selectChannel(channel.id)}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors",
                                "hover:bg-[#2c2f33]"
                              )}
                            >
                              <Hash className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className={cn(
                                "text-sm truncate flex-1",
                                (channel.unread_count || 0) > 0 
                                  ? "text-white font-semibold" 
                                  : "text-gray-400"
                              )}>
                                {channel.name}
                              </span>
                              {(channel.unread_count || 0) > 0 && (
                                <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] bg-primary text-primary-foreground">
                                  {channel.unread_count}
                                </Badge>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Direct Messages */}
                    {!channelsLoading && (
                      <div>
                        <div className="flex items-center justify-between px-2 py-1.5">
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            Direct Messages
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-gray-400 hover:text-white hover:bg-[#2c2f33]"
                                onClick={() => setShowCreateDm(true)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>New message</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="space-y-0.5">
                          {filteredDms.length === 0 ? (
                            <p className="text-xs text-gray-400 px-2.5 py-2">
                              No conversations yet
                            </p>
                          ) : (
                            filteredDms.map((dm) => (
                              <button
                                key={dm.id}
                                onClick={() => selectChannel(dm.id)}
                                className={cn(
                                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors",
                                  "hover:bg-[#2c2f33]"
                                )}
                              >
                                <div className="relative shrink-0">
                                  <div className="h-7 w-7 rounded-full bg-[#2c2f33] flex items-center justify-center text-xs font-semibold text-white">
                                    {dm.name.charAt(0)}
                                  </div>
                                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-[#1a1d21]" />
                                </div>
                                <span className={cn(
                                  "text-sm truncate flex-1",
                                  (dm.unread_count || 0) > 0 
                                    ? "text-white font-semibold" 
                                    : "text-gray-400"
                                )}>
                                  {dm.name}
                                </span>
                                {(dm.unread_count || 0) > 0 && (
                                  <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] bg-primary text-primary-foreground">
                                    {dm.unread_count}
                                  </Badge>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Quick Links */}
                    <div className="pt-2 border-t border-[#2c2f33]">
                      <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors hover:bg-[#2c2f33]">
                        <AtSign className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-400">Mentions</span>
                      </button>
                      <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors hover:bg-[#2c2f33]">
                        <Users className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-400">Team</span>
                      </button>
                    </div>
                  </div>
                </ScrollArea>

                {/* Footer - User info */}
                <div className="flex-shrink-0 p-3 border-t border-[#2c2f33] bg-[#1a1d21]">
                  <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#2c2f33] transition-colors cursor-pointer">
                    <div className="relative">
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                        {user?.email?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-[#1a1d21]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {user?.email?.split("@")[0] || "User"}
                      </p>
                      <p className="text-[10px] text-gray-400">Online</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Resize handle when open */}
        {open && (
          <div
            ref={resizeRef}
            onMouseDown={handleMouseDown}
            className={cn(
              "absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize z-10",
              "hover:bg-primary/30 transition-colors",
              isResizing && "bg-primary/50"
            )}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100" />
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateChannelModal
        open={showCreateChannel}
        onOpenChange={setShowCreateChannel}
        onCreate={createChannel}
        isLoading={isCreatingChannel}
      />

      <CreateDmModal
        open={showCreateDm}
        onOpenChange={setShowCreateDm}
        onCreate={(userIds, groupName) => createDm({ userIds, groupName })}
        isLoading={isCreatingDm}
        teamMembers={teamMembers}
        currentUserId={user?.id}
      />
    </TooltipProvider>
  );
}
