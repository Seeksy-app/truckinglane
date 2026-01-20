import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Bot,
  Search,
  Key,
  SendHorizontal,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const COLLAPSED_WIDTH = 56;

interface DemoIntelligenceRailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
}

type RailTab = "chat" | "carrier" | "keywords";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Demo chat responses
const demoResponses: Record<string, string> = {
  default: "I'm your AI assistant! In the live platform, I can help you find loads, look up carriers, and manage your leads. Try asking me about available loads or carrier information.",
  load: "I found 3 flatbed loads from Chicago to Dallas available today. Load #FL-2847 offers the best rate at $2.85/mile. Would you like me to show you the details?",
  carrier: "Looking up carrier information... I found MC# 123456 - ABC Trucking. They have an 'Authorized' status with 12 power units. Would you like more details?",
  lead: "You have 5 pending leads from today's calls. The top priority lead is from J&R Transport - they're looking for a regular lane from Atlanta to Miami.",
};

export function DemoIntelligenceRail({
  open,
  onOpenChange,
  width,
  onWidthChange,
}: DemoIntelligenceRailProps) {
  const [activeTab, setActiveTab] = useState<RailTab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open && activeTab === "chat") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, activeTab]);

  // Simulate AI response
  const simulateResponse = useCallback((userMessage: string) => {
    setIsTyping(true);
    setTimeout(() => {
      const lowerMsg = userMessage.toLowerCase();
      let response = demoResponses.default;
      if (lowerMsg.includes("load") || lowerMsg.includes("freight")) {
        response = demoResponses.load;
      } else if (lowerMsg.includes("carrier") || lowerMsg.includes("mc") || lowerMsg.includes("dot")) {
        response = demoResponses.carrier;
      } else if (lowerMsg.includes("lead") || lowerMsg.includes("call")) {
        response = demoResponses.lead;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
      setIsTyping(false);
    }, 1000);
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    simulateResponse(userMsg);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (open && e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Resize handlers
  const handleMouseDown = () => setIsResizing(true);
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
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
          "fixed top-0 right-0 h-full z-50 flex transition-all duration-300 ease-out",
          open ? "" : "w-14"
        )}
        style={{ width: open ? width : COLLAPSED_WIDTH }}
      >
        {/* Resize handle */}
        {open && (
          <div
            className="w-1 cursor-ew-resize bg-transparent hover:bg-[hsl(var(--safety-orange))]/40 transition-colors"
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Main rail content */}
        <div className="flex-1 bg-card border-l border-border flex flex-col overflow-hidden">
          {!open ? (
            /* Collapsed view */
            <div className="flex flex-col items-center pt-4 gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onOpenChange(true)}
                    className="relative p-0 bg-transparent border-0 cursor-pointer group"
                  >
                    <Avatar className="h-12 w-12 ring-2 ring-[hsl(var(--safety-orange))]/40 group-hover:ring-[hsl(var(--safety-orange))] transition-all">
                      <AvatarFallback className="bg-gradient-to-br from-[hsl(var(--safety-orange))] to-[hsl(25,95%,40%)] text-white">
                        <Bot className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>AI Assistant (⌘K)</p>
                </TooltipContent>
              </Tooltip>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            /* Expanded view */
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[hsl(var(--safety-orange))] to-[hsl(25,95%,40%)] flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-semibold text-foreground">AI Assistant</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-border bg-muted/20">
                {[
                  { id: "chat" as RailTab, label: "AI Chat", icon: Bot },
                  { id: "carrier" as RailTab, label: "Carrier", icon: Truck },
                  { id: "keywords" as RailTab, label: "Keywords", icon: Key },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
                      activeTab === tab.id
                        ? "text-[hsl(var(--safety-orange))] border-b-2 border-[hsl(var(--safety-orange))] bg-[hsl(var(--safety-orange))]/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {activeTab === "chat" && (
                  <>
                    <ScrollArea className="flex-1 p-4">
                      {messages.length === 0 ? (
                        <div className="text-center py-8">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[hsl(var(--safety-orange))]/20 to-[hsl(25,95%,40%)]/20 flex items-center justify-center mx-auto mb-3">
                            <Sparkles className="h-6 w-6 text-[hsl(var(--safety-orange))]" />
                          </div>
                          <p className="text-sm font-medium text-foreground mb-1">Ask me anything</p>
                          <p className="text-xs text-muted-foreground">I can help find loads, lookup carriers, and more</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {messages.map((msg, i) => (
                            <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                              {msg.role === "assistant" && (
                                <Avatar className="h-7 w-7 shrink-0">
                                  <AvatarFallback className="bg-gradient-to-br from-[hsl(var(--safety-orange))] to-[hsl(25,95%,40%)] text-white text-xs">
                                    <Bot className="h-3.5 w-3.5" />
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div className={cn(
                                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                                msg.role === "user"
                                  ? "bg-[hsl(var(--safety-orange))] text-white"
                                  : "bg-muted text-foreground"
                              )}>
                                {msg.content}
                              </div>
                            </div>
                          ))}
                          {isTyping && (
                            <div className="flex gap-2">
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className="bg-gradient-to-br from-[hsl(var(--safety-orange))] to-[hsl(25,95%,40%)] text-white text-xs">
                                  <Bot className="h-3.5 w-3.5" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                                Thinking...
                              </div>
                            </div>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </ScrollArea>

                    {/* Input */}
                    <div className="p-3 border-t border-border bg-muted/20">
                      <div className="flex gap-2">
                        <Input
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                          placeholder="Ask about loads, carriers..."
                          className="flex-1 bg-background"
                        />
                        <Button
                          onClick={handleSend}
                          disabled={!input.trim()}
                          size="icon"
                          className="bg-[hsl(var(--safety-orange))] hover:bg-[hsl(25,95%,45%)] text-white shrink-0"
                        >
                          <SendHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === "carrier" && (
                  <div className="p-4">
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Enter MC# or DOT#" className="pl-10" />
                    </div>
                    <p className="text-center text-sm text-muted-foreground py-8">
                      Enter an MC or DOT number to look up carrier information
                    </p>
                  </div>
                )}

                {activeTab === "keywords" && (
                  <div className="p-4">
                    <p className="text-center text-sm text-muted-foreground py-8">
                      High-intent keywords will appear here when configured
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
