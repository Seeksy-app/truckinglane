import { useState, useRef, useEffect } from "react";
import {
  ChevronRight,
  MessageSquare,
  Hash,
  Users,
  SendHorizontal,
  Plus,
  AtSign,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const COLLAPSED_WIDTH = 56;

interface DemoInternalChatRailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
}

interface DemoMessage {
  id: string;
  sender: string;
  content: string;
  time: string;
  isOwn: boolean;
}

interface DemoChannel {
  id: string;
  name: string;
  unread: number;
}

// Demo data
const demoChannels: DemoChannel[] = [
  { id: "1", name: "general", unread: 3 },
  { id: "2", name: "urgent-loads", unread: 1 },
  { id: "3", name: "carrier-updates", unread: 0 },
];

const demoMessages: DemoMessage[] = [
  { id: "1", sender: "Sarah M.", content: "Just booked load #FL-2847, heading out to Dallas!", time: "9:42 AM", isOwn: false },
  { id: "2", sender: "You", content: "Nice! That's a great lane. What rate did you get?", time: "9:43 AM", isOwn: true },
  { id: "3", sender: "Sarah M.", content: "$2.85/mile, carrier was happy with it", time: "9:44 AM", isOwn: false },
  { id: "4", sender: "Mike J.", content: "Anyone have a carrier for a reefer load from Atlanta?", time: "9:50 AM", isOwn: false },
];

export function DemoInternalChatRail({
  open,
  onOpenChange,
  width,
  onWidthChange,
}: DemoInternalChatRailProps) {
  const [activeChannel, setActiveChannel] = useState<DemoChannel | null>(null);
  const [input, setInput] = useState("");
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChannel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (open && e.key === "Escape") {
        if (activeChannel) {
          setActiveChannel(null);
        } else {
          onOpenChange(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, activeChannel, onOpenChange]);

  // Resize handlers
  const handleMouseDown = () => setIsResizing(true);
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      onWidthChange(Math.min(520, Math.max(320, newWidth)));
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  const totalUnread = demoChannels.reduce((sum, ch) => sum + ch.unread, 0);

  return (
    <TooltipProvider>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Rail container */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full z-50 flex transition-all duration-300 ease-out",
          open ? "" : "w-14"
        )}
        style={{ width: open ? width : COLLAPSED_WIDTH }}
      >
        {/* Main rail content */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ backgroundColor: "#1a1d21" }}
        >
          {!open ? (
            /* Collapsed view */
            <div className="flex flex-col items-center pt-4 gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onOpenChange(true)}
                    className="relative p-0 bg-transparent border-0 cursor-pointer group"
                  >
                    <Avatar className="h-12 w-12 ring-2 ring-[hsl(210,80%,45%)]/40 group-hover:ring-[hsl(210,80%,45%)] transition-all">
                      <AvatarFallback className="bg-gradient-to-br from-[hsl(210,80%,50%)] to-[hsl(210,80%,35%)] text-white">
                        <MessageSquare className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    {totalUnread > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center ring-2 ring-background">
                        {totalUnread}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Team Chat (⌘⇧K)</p>
                </TooltipContent>
              </Tooltip>
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </div>
          ) : (
            /* Expanded view */
            <>
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: "#2c2f33" }}
              >
                <span className="font-semibold text-white">Team Chat</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {activeChannel ? (
                /* Active channel view */
                <>
                  <div
                    className="flex items-center gap-2 px-4 py-2 border-b"
                    style={{ borderColor: "#2c2f33" }}
                  >
                    <button
                      onClick={() => setActiveChannel(null)}
                      className="text-gray-400 hover:text-white"
                    >
                      ←
                    </button>
                    <Hash className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-white">{activeChannel.name}</span>
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      {demoMessages.map((msg) => (
                        <div key={msg.id} className={cn("flex gap-2", msg.isOwn && "flex-row-reverse")}>
                          {!msg.isOwn && (
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="bg-[hsl(210,80%,45%)] text-white text-xs">
                                {msg.sender[0]}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className={cn(
                            "max-w-[80%] rounded-lg px-3 py-2",
                            msg.isOwn
                              ? "bg-[hsl(210,80%,45%)] text-white"
                              : "bg-[#2c2f33] text-gray-200"
                          )}>
                            {!msg.isOwn && (
                              <p className="text-xs font-medium text-gray-400 mb-0.5">{msg.sender}</p>
                            )}
                            <p className="text-sm">{msg.content}</p>
                            <p className="text-xs text-gray-500 mt-1">{msg.time}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Input */}
                  <div className="p-3 border-t" style={{ borderColor: "#2c2f33" }}>
                    <div className="flex gap-2">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Message #${activeChannel.name}`}
                        className="flex-1 bg-[#2c2f33] border-[#3c3f43] text-white placeholder:text-gray-500"
                      />
                      <Button
                        disabled={!input.trim()}
                        size="icon"
                        className="bg-[hsl(210,80%,45%)] hover:bg-[hsl(210,80%,40%)] text-white shrink-0"
                      >
                        <SendHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                /* Channel list */
                <ScrollArea className="flex-1">
                  <div className="p-3">
                    {/* Channels section */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between px-2 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Channels</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-500 hover:text-white hover:bg-white/10">
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="space-y-0.5">
                        {demoChannels.map((channel) => (
                          <button
                            key={channel.id}
                            onClick={() => setActiveChannel(channel)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                              channel.unread > 0
                                ? "text-white font-medium"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                          >
                            <Hash className="h-4 w-4 shrink-0 text-gray-500" />
                            <span className="flex-1 truncate">{channel.name}</span>
                            {channel.unread > 0 && (
                              <span className="h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
                                {channel.unread}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick links */}
                    <div className="space-y-0.5">
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        <AtSign className="h-4 w-4 text-gray-500" />
                        <span>Mentions</span>
                      </button>
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        <Users className="h-4 w-4 text-gray-500" />
                        <span>Team</span>
                      </button>
                    </div>
                  </div>
                </ScrollArea>
              )}

              {/* Footer */}
              {!activeChannel && (
                <div className="p-3 border-t" style={{ borderColor: "#2c2f33" }}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-to-br from-[hsl(var(--safety-orange))] to-[hsl(25,95%,40%)] text-white text-xs">
                        DA
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">Demo Agent</p>
                      <p className="text-xs text-gray-500">Online</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Resize handle */}
        {open && (
          <div
            className="w-1 cursor-ew-resize bg-transparent hover:bg-[hsl(210,80%,45%)]/40 transition-colors"
            onMouseDown={handleMouseDown}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
