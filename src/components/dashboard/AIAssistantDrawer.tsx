import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Lightbulb
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CarrierLookup } from "./CarrierLookup";
import { cn } from "@/lib/utils";
import { EntityLink, parseTextForEntities, EntityLinkData } from "@/components/chat/EntityLink";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface AIAssistantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string | null;
}

const CHAT_URL = "https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/ai-assistant";

const QUICK_ACTIONS = [
  { 
    icon: Search, 
    title: "Find a load", 
    description: "Search available loads by route, pay, or trailer",
    prompt: "Find me a load going from Texas to California",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400"
  },
  { 
    icon: Phone, 
    title: "Who to call", 
    description: "Prioritize callbacks with highest close probability",
    prompt: "Which leads should I prioritize calling back?",
    color: "bg-green-500/10 text-green-600 dark:text-green-400"
  },
  {
    icon: Zap, 
    title: "High intent", 
    description: "Today's hot leads worth calling first",
    prompt: "Show me today's high-intent leads",
    color: "bg-primary/10 text-primary"
  },
  { 
    icon: Truck, 
    title: "Check carrier", 
    description: "Verify authority, insurance, and risk",
    prompt: "Verify USDOT 4038099 (authority + insurance flags)",
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400"
  },
  { 
    icon: Clock, 
    title: "Callback sprint", 
    description: "Expiring leads and fast ROI",
    prompt: "Show leads expiring soon / fastest ROI callbacks",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400"
  },
  { 
    icon: BarChart3, 
    title: "Summarize my day", 
    description: "AEI highlights and next actions",
    prompt: "Give me my AEI highlights + what to do next",
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
  },
];

const MOTIVATION_TIPS = [
  "Tip: Calling back high-intent leads within 5 minutes boosts close rate by 21%.",
  "Pro tip: Verified carriers close 3x faster than unverified ones.",
  "Did you know? Morning callbacks have the highest pickup rate.",
  "Quick win: Check your AEI score to see today's priorities.",
];

// Default follow-up prompts
const DEFAULT_FOLLOW_UP_PROMPTS = [
  { label: "Reset", prompt: "__RESET__" },
  { label: "Show high-intent calls", prompt: "Show me today's high-intent calls" },
  { label: "Who should I call next?", prompt: "Who should I call next?" },
];

// Generate contextual follow-up prompts based on the AI's last message
const generateContextualPrompts = (lastAiMessage: string): { label: string; prompt: string }[] => {
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
  // Remove markdown bullets and asterisks
  let formatted = text
    .replace(/^\s*[-*]\s+/gm, "")  // Remove bullet points
    .replace(/\*\*/g, "")          // Remove bold asterisks
    .replace(/\*/g, "");           // Remove single asterisks
  
  return formatted;
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
        
        // Check if this looks like a title/header (ends with colon or short line)
        const isTitle = /^[A-Z].*:$/.test(trimmed) || 
                       (trimmed.length < 40 && /^[A-Z]/.test(trimmed) && !trimmed.includes("$"));
        
        if (isTitle) {
          return (
            <p key={i} className="text-sm font-semibold text-foreground pt-1">
              {trimmed}
            </p>
          );
        }
        
        // Parse for entities (loads, carriers, leads)
        const segments = parseTextForEntities(trimmed);
        
        // Check for status labels to bold them
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
              
              // Bold status labels in regular text
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

export function AIAssistantDrawer({ open, onOpenChange, agencyId }: AIAssistantDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "carrier">("chat");
  const [motivationTip] = useState(() => MOTIVATION_TIPS[Math.floor(Math.random() * MOTIVATION_TIPS.length)]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Handle entity clicks - navigate to dashboard with lead/load highlighted
  const handleEntityClick = useCallback((entity: EntityLinkData) => {
    if (entity.type === "carrier") {
      setActiveTab("carrier");
    } else if (entity.type === "lead" && entity.params?.phone) {
      // Close drawer and navigate to dashboard with lead phone in URL
      onOpenChange(false);
      navigate(`/dashboard?lead=${encodeURIComponent(entity.params.phone)}`);
    } else if (entity.type === "load") {
      // Close drawer and navigate to dashboard with load number in URL
      onOpenChange(false);
      navigate(`/dashboard?load=${encodeURIComponent(entity.id)}`);
    }
  }, [onOpenChange, navigate]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

      // Add empty assistant message
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (isLoading) return;
    streamChat(prompt);
  };

  const handleFollowUp = (prompt: string) => {
    if (prompt === "__RESET__") {
      handleReset();
      return;
    }
    if (isLoading) return;
    streamChat(prompt);
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
  };

  const formatTime = (date?: Date) => {
    if (!date) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Get contextual prompts based on the last AI message
  const lastAiMessage = messages.filter(m => m.role === "assistant").pop()?.content || "";
  const contextualPrompts = generateContextualPrompts(lastAiMessage);

  const showFollowUps = messages.length > 0 && !isLoading && messages[messages.length - 1]?.role === "assistant";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent hideClose className="w-full sm:max-w-md p-0 flex flex-col bg-background border-l border-border gap-0">
        {/* Header - Modern gradient background */}
        <div className="flex-shrink-0 bg-gradient-to-br from-card via-card to-muted/30 border-b border-border">
          {/* Top bar with close */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[hsl(25,95%,53%)] via-[hsl(25,95%,48%)] to-[hsl(25,95%,40%)] flex items-center justify-center shadow-xl shadow-[hsl(25,95%,53%)]/30 ring-2 ring-[hsl(25,95%,53%)]/20">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground tracking-tight">AI Assistant</h2>
                <p className="text-xs text-muted-foreground">Your dispatch sidekick — let's crush it! 🚀</p>
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
            <div className="flex gap-1.5 p-1.5 bg-muted/60 rounded-xl">
              <button
                onClick={() => setActiveTab("chat")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                  activeTab === "chat" 
                    ? "bg-background text-foreground shadow-md ring-1 ring-border/50" 
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Sparkles className="h-4 w-4" />
                AI Chat
              </button>
              <button
                onClick={() => setActiveTab("carrier")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                  activeTab === "carrier" 
                    ? "bg-background text-foreground shadow-md ring-1 ring-border/50" 
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Truck className="h-4 w-4" />
                Carrier Lookup
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {activeTab === "chat" ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Chat Input - Prominent and always visible */}
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
                    Press Enter to send, Shift+Enter for new line
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
                    {/* Welcome Section */}
                    <div className="text-center pt-2 pb-4">
                      <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-[hsl(25,95%,53%)]/20 via-[hsl(25,95%,53%)]/10 to-transparent flex items-center justify-center mb-4 ring-1 ring-[hsl(25,95%,53%)]/30">
                        <Sparkles className="h-8 w-8 text-[hsl(25,95%,53%)]" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">How can I help?</h3>
                      <p className="text-sm text-muted-foreground">
                        Ask about loads, carriers, callbacks, or today&apos;s priorities.
                      </p>
                    </div>

                    {/* Quick Actions Grid */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Actions</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {QUICK_ACTIONS.map((action, index) => (
                          <button
                            key={index}
                            onClick={() => handleQuickAction(action.prompt)}
                            disabled={isLoading}
                            className="group p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 hover:shadow-sm transition-all text-left"
                          >
                            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2 transition-colors", action.color)}>
                              <action.icon className="h-4 w-4" />
                            </div>
                            <p className="text-sm font-medium text-foreground mb-0.5">{action.title}</p>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{action.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Motivation Tip */}
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/10">
                      <Lightbulb className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{motivationTip}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          Start with &quot;Who should I call next?&quot; or &quot;Find me a load going from Texas to California.&quot;
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg, index) => (
                      <div
                        key={index}
                        className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}
                      >
                        {msg.role === "assistant" && (
                          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                          </div>
                        )}
                        <div className={cn("max-w-[85%] space-y-1", msg.role === "user" ? "items-end" : "items-start")}>
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5",
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-muted/70 text-foreground rounded-bl-md border border-border/50"
                            )}
                          >
                            {msg.content ? (
                              msg.role === "assistant" ? (
                                <FormattedResponse content={msg.content} onEntityClick={handleEntityClick} />
                              ) : (
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                              )
                            ) : isLoading && index === messages.length - 1 ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-muted-foreground">Thinking</span>
                                <span className="flex gap-0.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </span>
                              </div>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-muted-foreground/60 px-1">{formatTime(msg.timestamp)}</span>
                        </div>
                        {msg.role === "user" && (
                          <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-medium text-muted-foreground">You</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {isLoading && messages[messages.length - 1]?.role === "user" && (
                      <div className="flex gap-2.5 justify-start">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                        </div>
                        <div className="bg-muted/70 rounded-2xl rounded-bl-md px-4 py-2.5 border border-border/50">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-muted-foreground">Thinking</span>
                            <span className="flex gap-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Follow-up Prompts - shown after AI response */}
                    {showFollowUps && (
                      <div className="pt-3 space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-1">Suggested follow-ups</p>
                        <div className="flex flex-wrap gap-1.5">
                          {contextualPrompts.map((item, i) => (
                            <button
                              key={`prompt-${i}`}
                              onClick={() => handleFollowUp(item.prompt)}
                              className={cn(
                                "px-3 py-1.5 text-xs rounded-full border transition-all",
                                item.prompt === "__RESET__"
                                  ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                                  : "border-border bg-card hover:bg-muted hover:border-primary/30 text-foreground"
                              )}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex-1 p-4 overflow-auto">
            <CarrierLookup agencyId={agencyId} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
