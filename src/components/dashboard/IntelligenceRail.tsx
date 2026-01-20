import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Bot,
  Send,
  Loader2,
  Sparkles,
  Search,
  Phone,
  RotateCcw,
  Truck,
  X,
  Zap,
  Clock,
  BarChart3,
  GripVertical,
  ChevronRight,
  Target
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { CarrierLookup } from "./CarrierLookup";
import { useToast } from "@/hooks/use-toast";
import { EntityLink, parseTextForEntities, EntityLinkData } from "@/components/chat/EntityLink";
import { WhyThisLeadChips, calculatePriorityData } from "./WhyThisLeadChips";
import { HighIntentKeywords } from "./HighIntentKeywords";
import { useAuth } from "@/hooks/useAuth";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { getDateWindow } from "@/lib/dateWindows";

type Lead = Tables<"leads">;

interface IntelligenceRailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string | null;
  onOpenChat: () => void;
  width: number;
  onWidthChange: (width: number) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

const CHAT_URL = "https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/ai-assistant";

const QUICK_ACTIONS = [
  { 
    icon: Search, 
    title: "Find a load", 
    description: "Search by route or pay",
    prompt: "Find me a load going from Texas to California",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400"
  },
  { 
    icon: Phone, 
    title: "Who to call", 
    description: "Prioritize callbacks",
    prompt: "Which leads should I prioritize calling back?",
    color: "bg-green-500/10 text-green-600 dark:text-green-400"
  },
  {
    icon: Zap, 
    title: "High intent", 
    description: "Today's hot leads",
    prompt: "Show me today's high-intent leads",
    color: "bg-primary/10 text-primary"
  },
  { 
    icon: Truck, 
    title: "Check carrier", 
    description: "Verify authority",
    prompt: "Verify USDOT 4038099 (authority + insurance flags)",
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400"
  },
  { 
    icon: Clock, 
    title: "Callback sprint", 
    description: "Expiring leads",
    prompt: "Show leads expiring soon / fastest ROI callbacks",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400"
  },
  { 
    icon: BarChart3, 
    title: "Summarize my day", 
    description: "AEI highlights",
    prompt: "Give me my AEI highlights + what to do next",
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
  },
];

const DEFAULT_FOLLOW_UP_PROMPTS = [
  { label: "Reset", prompt: "__RESET__" },
  { label: "Show high-intent calls", prompt: "Show me today's high-intent calls" },
  { label: "Who should I call next?", prompt: "Who should I call next?" },
];

// Generate contextual follow-up prompts based on the AI's last message
const getContextualPrompts = (lastAiMessage: string): { label: string; prompt: string }[] => {
  const lowerMessage = lastAiMessage.toLowerCase();
  
  // Detect clarifying questions about DOT/MC vs Load numbers
  if (lowerMessage.includes("carrier") && lowerMessage.includes("load number") && 
      (lowerMessage.includes("are you looking") || lowerMessage.includes("is this"))) {
    // Extract the number from the message
    const numberMatch = lastAiMessage.match(/\*\*(\d+)\*\*|for (\d+)/);
    const number = numberMatch ? (numberMatch[1] || numberMatch[2]) : "";
    return [
      { label: "Reset", prompt: "__RESET__" },
      { label: `It's a carrier (DOT/MC)`, prompt: number ? `Look up carrier with DOT ${number}` : "It's a carrier DOT/MC number" },
      { label: `It's a load number`, prompt: number ? `Look up load #${number}` : "It's a load number" },
    ];
  }
  
  // Detect carrier lookup questions
  if (lowerMessage.includes("carrier") && (lowerMessage.includes("which") || lowerMessage.includes("select") || lowerMessage.includes("choose"))) {
    return [
      { label: "Reset", prompt: "__RESET__" },
      { label: "Show carrier details", prompt: "Show me the carrier details" },
      { label: "Check another carrier", prompt: "Look up a different carrier" },
    ];
  }
  
  // Detect load-related responses
  if (lowerMessage.includes("load #") || lowerMessage.includes("load details")) {
    return [
      { label: "Reset", prompt: "__RESET__" },
      { label: "Find similar loads", prompt: "Find me similar loads on this route" },
      { label: "Who called about this?", prompt: "Who has called about this load?" },
    ];
  }
  
  // Detect high-intent lead responses
  if (lowerMessage.includes("high-intent") || lowerMessage.includes("high intent")) {
    return [
      { label: "Reset", prompt: "__RESET__" },
      { label: "Show all leads", prompt: "Show me all active leads" },
      { label: "Best callback order?", prompt: "What order should I call these back?" },
    ];
  }
  
  // Detect callback/lead priority responses  
  if (lowerMessage.includes("call") && (lowerMessage.includes("prioritize") || lowerMessage.includes("next") || lowerMessage.includes("first"))) {
    return [
      { label: "Reset", prompt: "__RESET__" },
      { label: "Why this lead?", prompt: "Why should I prioritize this lead?" },
      { label: "Show high-intent only", prompt: "Show me only high-intent leads" },
    ];
  }
  
  // Detect carrier verification responses
  if (lowerMessage.includes("authority") || lowerMessage.includes("insurance") || lowerMessage.includes("usdot") || lowerMessage.includes("mc #")) {
    return [
      { label: "Reset", prompt: "__RESET__" },
      { label: "Check another carrier", prompt: "Look up a different carrier" },
      { label: "Recent calls from them?", prompt: "Have we had any recent calls from this carrier?" },
    ];
  }
  
  // Default prompts
  return DEFAULT_FOLLOW_UP_PROMPTS;
};

// Helper to format AI response - remove markdown artifacts
const formatResponseText = (text: string): string => {
  return text
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "");
};

// Helper to render formatted response with proper styling and clickable entity links
const FormattedResponse = ({ content, onEntityClick }: { content: string; onEntityClick?: (entity: EntityLinkData) => void }) => {
  const formatted = formatResponseText(content);
  const lines = formatted.split("\n");
  
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        
        const isTitle = /^[A-Z].*:$/.test(trimmed) || 
                       (trimmed.length < 40 && /^[A-Z]/.test(trimmed) && !trimmed.includes("$"));
        
        if (isTitle) {
          return (
            <p key={i} className="text-sm font-semibold text-foreground pt-1">
              {trimmed}
            </p>
          );
        }
        
        const segments = parseTextForEntities(trimmed);
        const hasStatus = /\b(Completed|Open|Claimed|Booked|High Intent|Lead)\b/i.test(trimmed);
        
        return (
          <p key={i} className="text-sm text-foreground leading-relaxed">
            {segments.map((seg, j) => {
              if (seg.type === "entity" && seg.entity) {
                return (
                  <EntityLink 
                    key={j} 
                    entity={seg.entity} 
                    onClick={onEntityClick}
                    className="mx-0.5"
                  />
                );
              }
              
              if (hasStatus) {
                const parts = seg.content.split(/\b(Completed|Open|Claimed|Booked|High Intent|Lead)\b/gi);
                return parts.map((part, k) => {
                  if (/^(Completed|Open|Claimed|Booked|High Intent|Lead)$/i.test(part)) {
                    return <span key={`${j}-${k}`} className="font-semibold">{part}</span>;
                  }
                  return <span key={`${j}-${k}`}>{part}</span>;
                });
              }
              
              return <span key={j}>{seg.content}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
};

const COLLAPSED_WIDTH = 56;
const DEFAULT_EXPANDED_WIDTH = 440;

export function IntelligenceRail({ 
  open, 
  onOpenChange, 
  agencyId, 
  onOpenChat,
  width,
  onWidthChange
}: IntelligenceRailProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { timezone } = useUserTimezone();
  const resizeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "carrier" | "keywords">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [viewedLeadIds, setViewedLeadIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Get today's date window for filtering
  const todayWindow = useMemo(() => getDateWindow("today", timezone), [timezone]);

  // Fetch pending leads for badge and "Who to call" list - only today's leads
  const { data: pendingLeads = [] } = useQuery({
    queryKey: ["intelligence-rail-leads", agencyId, todayWindow.startTs],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("status", "pending")
        .gte("created_at", todayWindow.startTs)
        .lte("created_at", todayWindow.endTs)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!agencyId,
    refetchInterval: 30000, // Refresh more frequently to catch claims
  });

  // Sort leads by priority score
  const prioritizedLeads = useMemo(() => {
    return [...pendingLeads]
      .map(lead => ({
        lead,
        ...calculatePriorityData(lead),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [pendingLeads]);

  // Badge shows high-intent leads that haven't been viewed yet
  const pendingLeadsCount = pendingLeads.filter(l => l.is_high_intent && !viewedLeadIds.has(l.id)).length;

  // Mark all current high-intent leads as viewed when rail is opened
  const handleOpenRail = useCallback(() => {
    const highIntentIds = pendingLeads.filter(l => l.is_high_intent).map(l => l.id);
    setViewedLeadIds(prev => new Set([...prev, ...highIntentIds]));
    onOpenChange(true);
  }, [pendingLeads, onOpenChange]);

  // Handle entity clicks
  const handleEntityClick = useCallback((entity: EntityLinkData) => {
    if (entity.type === "carrier") {
      setActiveTab("carrier");
    } else if (entity.type === "lead" && entity.params?.phone) {
      onOpenChange(false);
      navigate(`/dashboard?lead=${encodeURIComponent(entity.params.phone)}`);
    } else if (entity.type === "load") {
      onOpenChange(false);
      navigate(`/dashboard?load=${encodeURIComponent(entity.id)}`);
    }
  }, [onOpenChange, navigate]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Stream chat
  const streamChat = useCallback(async (userMessage: string) => {
    const userMsg: Message = { role: "user", content: userMessage, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantContent = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow`,
        },
        body: JSON.stringify({ 
          messages: [...messages, userMsg],
          agencyId 
        }),
      });

      if (!resp.ok || !resp.body) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to start stream");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "", timestamp: new Date() }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const newMessages = [...prev];
                if (newMessages[newMessages.length - 1]?.role === "assistant") {
                  newMessages[newMessages.length - 1] = { role: "assistant", content: assistantContent, timestamp: new Date() };
                }
                return newMessages;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error("AI chat error:", e);
      toast({
        title: "AI Error",
        description: e instanceof Error ? e.message : "Failed to get response",
        variant: "destructive",
      });
      setMessages((prev) => prev.filter((m, i) => !(i === prev.length - 1 && m.role === "assistant" && m.content === "")));
    } finally {
      setIsLoading(false);
    }
  }, [messages, agencyId, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const message = input.trim();
    setInput("");
    streamChat(message);
  };

  const handleQuickAction = (prompt: string) => {
    if (isLoading) return;
    streamChat(prompt);
  };

  const handleFollowUp = (prompt: string) => {
    if (prompt === "__RESET__") {
      setMessages([]);
      setInput("");
      return;
    }
    if (isLoading) return;
    streamChat(prompt);
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
  };

  // Resize handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      onWidthChange(Math.max(380, Math.min(520, newWidth)));
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

  // Handle Escape key and ⌘K/Ctrl+K to close/toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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

  const showFollowUps = messages.length > 0 && !isLoading && messages[messages.length - 1]?.role === "assistant";
  
  // Get contextual follow-up prompts based on the last AI message
  const lastAiMessage = messages.filter(m => m.role === "assistant").pop()?.content || "";
  const contextualPrompts = getContextualPrompts(lastAiMessage);

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
          "fixed top-0 right-0 h-full z-40 flex transition-all duration-300 ease-out",
          isResizing && "select-none"
        )}
        style={{ 
          width: open ? Math.max(width, DEFAULT_EXPANDED_WIDTH) : COLLAPSED_WIDTH,
          transform: "translateX(0)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Resize handle when open */}
        {open && (
          <div
            ref={resizeRef}
            onMouseDown={handleMouseDown}
            className={cn(
              "absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize z-10",
              "hover:bg-primary/30 transition-colors",
              isResizing && "bg-primary/50"
            )}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100" />
            </div>
          </div>
        )}

        {/* Collapsed State - Clean, minimal pill button with expand indicator */}
        {!open && (
          <div 
            onClick={handleOpenRail}
            className="h-full w-full flex flex-col items-center justify-center bg-[#1a1d21] border-l border-[#2c2f33] cursor-pointer hover:bg-[#2c2f33] transition-colors"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "relative h-12 w-12 rounded-full flex items-center justify-center",
                      "bg-gradient-to-br from-[hsl(25,95%,53%)] to-[hsl(25,95%,45%)]",
                      "ring-2 ring-[#2c2f33]",
                      "hover:ring-primary/50 hover:scale-105",
                      "transition-all duration-200"
                    )}
                  >
                    <Sparkles className="h-5 w-5 text-white" />
                    {/* Badge for high-priority leads */}
                    {pendingLeadsCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                        {pendingLeadsCount > 9 ? "9+" : pendingLeadsCount}
                      </span>
                    )}
                  </div>
                  {/* Expand arrow indicator */}
                  <ChevronRight className="h-4 w-4 text-muted-foreground rotate-180" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-sm">
                <p>Open AI Assistant (⌘K)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Expanded State - AI Assistant Panel */}
        {open && (
          <div 
            className="w-full h-full flex flex-col bg-background border-l border-border shadow-2xl"
            onClick={(e) => {
              // Close rail when clicking empty areas (not buttons, inputs, or interactive elements)
              const target = e.target as HTMLElement;
              const isInteractive = target.closest('button, input, textarea, a, [role="button"], [data-interactive]');
              if (!isInteractive) {
                onOpenChange(false);
              }
            }}
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-gradient-to-br from-card via-card to-muted/30 border-b border-border">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[hsl(25,95%,53%)] via-[hsl(25,95%,48%)] to-[hsl(25,95%,40%)] flex items-center justify-center shadow-xl shadow-[hsl(25,95%,53%)]/30 ring-2 ring-[hsl(25,95%,53%)]/20">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground tracking-tight">AI Assistant</h2>
                    <p className="text-xs text-muted-foreground">Your dispatch sidekick</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => onOpenChange(false)}
                  className="h-9 w-9 rounded-xl border-border/60 bg-background/50 hover:bg-background text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Tab Pills */}
              <div className="px-5 pb-4">
                <div className="flex gap-1 p-1 bg-muted/60 rounded-xl">
                  <button
                    onClick={() => setActiveTab("chat")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                      activeTab === "chat" 
                        ? "bg-background text-foreground shadow-md ring-1 ring-border/50" 
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Chat
                  </button>
                  <button
                    onClick={() => setActiveTab("carrier")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                      activeTab === "carrier" 
                        ? "bg-background text-foreground shadow-md ring-1 ring-border/50" 
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    <Truck className="h-3.5 w-3.5" />
                    Carrier
                  </button>
                  <button
                    onClick={() => setActiveTab("keywords")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                      activeTab === "keywords" 
                        ? "bg-background text-foreground shadow-md ring-1 ring-border/50" 
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    <Target className="h-3.5 w-3.5" />
                    Keywords
                  </button>
                </div>
              </div>
            </div>

            {/* Content Area */}
            {activeTab === "chat" ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Chat Input - Always visible */}
                <div className="flex-shrink-0 bg-gradient-to-b from-muted/40 to-transparent px-5 py-5">
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="flex gap-3 items-end">
                      <div className="flex-1 relative">
                        <Input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit(e)}
                          placeholder="Ask about loads, carriers, callbacks..."
                          disabled={isLoading}
                          className="h-14 text-sm bg-background border-border/80 shadow-sm focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40 rounded-xl px-4"
                        />
                      </div>
                      <Button 
                        type="submit" 
                        disabled={isLoading || !input.trim()} 
                        size="icon"
                        className="h-14 w-14 shrink-0 bg-[hsl(25,95%,55%)] hover:bg-[hsl(25,95%,50%)] shadow-lg shadow-[hsl(25,95%,55%)]/40 rounded-xl"
                      >
                        {isLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] text-muted-foreground/70">
                        Press Enter to send
                      </p>
                      {messages.length > 0 && (
                        <button 
                          type="button"
                          onClick={handleReset} 
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset chat
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Scrollable Content */}
                <ScrollArea className="flex-1" ref={scrollRef}>
                  <div className="p-4">
                    {messages.length === 0 ? (
                      <div className="space-y-5">
                        {/* Quick Actions Grid */}
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Quick Actions</p>
                          <div className="grid grid-cols-2 gap-2.5">
                            {QUICK_ACTIONS.map((action) => (
                              <button
                                key={action.prompt}
                                onClick={() => handleQuickAction(action.prompt)}
                                className={cn(
                                  "flex flex-col items-start gap-2 p-4 rounded-xl border border-border/60 bg-card",
                                  "hover:border-primary/40 hover:bg-primary/5 hover:shadow-md",
                                  "transition-all duration-200 text-left group"
                                )}
                              >
                                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", action.color)}>
                                  <action.icon className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                                  <p className="text-[11px] text-muted-foreground">{action.description}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Who Should I Call Next? */}
                        {prioritizedLeads.length > 0 && (
                          <div className="space-y-3 pt-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Who to Call Next</p>
                            <div className="space-y-2">
                              {prioritizedLeads.map(({ lead, score, reasons, timeInQueue }) => (
                                <button
                                  key={lead.id}
                                  onClick={() => {
                                    onOpenChange(false);
                                    navigate(`/dashboard?lead=${encodeURIComponent(lead.caller_phone)}`);
                                  }}
                                  className="w-full flex flex-col gap-2 p-3 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                          {lead.caller_name || lead.caller_company || lead.caller_phone}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                          {lead.caller_phone}
                                        </p>
                                      </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  </div>
                                  <WhyThisLeadChips lead={lead} showScore showTime maxChips={2} />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((msg, i) => (
                          <div key={i} className={cn(
                            "flex gap-3",
                            msg.role === "user" ? "justify-end" : "justify-start"
                          )}>
                            {msg.role === "assistant" && (
                              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[hsl(25,95%,53%)] to-[hsl(25,95%,45%)] flex items-center justify-center shrink-0">
                                <Bot className="h-4 w-4 text-white" />
                              </div>
                            )}
                            <div className={cn(
                              "max-w-[85%] rounded-2xl px-4 py-3",
                              msg.role === "user" 
                                ? "bg-primary text-primary-foreground rounded-br-md" 
                                : "bg-muted/60 border border-border/50 rounded-bl-md"
                            )}>
                              {msg.role === "assistant" && msg.content === "" ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Thinking...
                                </div>
                              ) : msg.role === "assistant" ? (
                                <FormattedResponse content={msg.content} onEntityClick={handleEntityClick} />
                              ) : (
                                <p className="text-sm">{msg.content}</p>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Follow-up prompts */}
                        {showFollowUps && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {contextualPrompts.map((fp) => (
                              <button
                                key={fp.prompt}
                                onClick={() => handleFollowUp(fp.prompt)}
                                className={cn(
                                  "px-3 py-1.5 text-xs font-medium rounded-full border transition-all",
                                  fp.prompt === "__RESET__"
                                    ? "border-border text-muted-foreground hover:text-foreground hover:border-foreground/50"
                                    : "border-primary/30 text-primary hover:bg-primary/10"
                                )}
                              >
                                {fp.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : activeTab === "carrier" ? (
              <ScrollArea className="flex-1">
                <div className="p-5">
                  <CarrierLookup agencyId={agencyId} />
                </div>
              </ScrollArea>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-5">
                  <HighIntentKeywords agencyId={agencyId} userId={user?.id || null} />
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
