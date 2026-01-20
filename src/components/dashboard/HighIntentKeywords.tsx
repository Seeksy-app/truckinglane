import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, X, User, Globe, MapPin, Hash, Route, Tag, Info, Clock, 
  BarChart3, TrendingUp, Lightbulb, Check, XCircle, Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { format, formatDistanceToNow } from "date-fns";

interface HighIntentKeywordsProps {
  agencyId: string | null;
  userId: string | null;
}

type KeywordType = "custom" | "city" | "lane" | "load" | "commodity";
type Scope = "agent" | "global";

interface Keyword {
  id: string;
  keyword: string;
  keyword_type: string;
  scope: string;
  agent_id: string | null;
  expires_at: string;
  load_id: string | null;
  active: boolean;
  created_by: string | null;
  match_type?: string;
  case_sensitive?: boolean;
  weight?: number;
}

interface KeywordAnalytics {
  keyword_id: string;
  keyword: string;
  scope: string;
  keyword_type: string;
  match_count: number;
  booked_count: number;
  conversion_rate: number;
  last_matched_at: string | null;
}

interface KeywordSuggestion {
  id: string;
  keyword: string;
  keyword_type: string;
  suggested_scope: string;
  status: string;
  load_id: string | null;
  created_at: string;
}

// Constants for caps
const MAX_AGENT_KEYWORDS = 25;
const MAX_GLOBAL_KEYWORDS = 100;
const MAX_DAILY_ADDS = 10;

// Calculate time until expiry
function getExpiryText(expiresAt: string): string {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diff = expiry.getTime() - now.getTime();
  
  if (diff <= 0) return "Expired";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Get icon for keyword type
function getTypeIcon(type: string) {
  switch (type) {
    case "city": return MapPin;
    case "lane": return Route;
    case "load": return Hash;
    case "commodity": return Package;
    default: return Tag;
  }
}

export function HighIntentKeywords({ agencyId, userId }: HighIntentKeywordsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role } = useUserRole();
  const isAdmin = role === "agency_admin" || role === "super_admin";
  
  const [newKeyword, setNewKeyword] = useState("");
  const [selectedScope, setSelectedScope] = useState<Scope>("agent");
  const [analyticsFilter, setAnalyticsFilter] = useState<"7" | "30" | "all">("7");
  
  // Fetch keywords (user's own + global)
  const { data: keywords = [], isLoading } = useQuery({
    queryKey: ["high-intent-keywords", agencyId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("high_intent_keywords")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Keyword[];
    },
    enabled: !!agencyId && !!userId,
    refetchInterval: 60000,
  });

  // Fetch keyword counts for caps
  const { data: agentKeywordCount = 0 } = useQuery({
    queryKey: ["agent-keyword-count", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("count_agent_active_keywords", { _agent_id: userId });
      if (error) return 0;
      return data as number;
    },
    enabled: !!userId,
  });

  const { data: globalKeywordCount = 0 } = useQuery({
    queryKey: ["global-keyword-count", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("count_global_active_keywords", { _agency_id: agencyId });
      if (error) return 0;
      return data as number;
    },
    enabled: !!agencyId,
  });

  const { data: dailyAddCount = 0 } = useQuery({
    queryKey: ["daily-add-count", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("count_agent_keyword_adds_today", { _agent_id: userId });
      if (error) return 0;
      return data as number;
    },
    enabled: !!userId,
  });

  // Fetch analytics
  const { data: analytics = [] } = useQuery({
    queryKey: ["keyword-analytics", agencyId, analyticsFilter],
    queryFn: async () => {
      const days = analyticsFilter === "all" ? 365 : parseInt(analyticsFilter);
      const { data, error } = await supabase.rpc("get_keyword_analytics", { 
        _agency_id: agencyId,
        _days: days
      });
      if (error) throw error;
      return (data || []) as KeywordAnalytics[];
    },
    enabled: !!agencyId && (isAdmin || true), // All users can see their keyword analytics
  });

  // Fetch suggestions
  const { data: suggestions = [] } = useQuery({
    queryKey: ["keyword-suggestions", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("keyword_suggestions")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as KeywordSuggestion[];
    },
    enabled: !!agencyId,
  });

  // Calculate next expiry for badge
  const nextExpiry = useMemo(() => {
    if (!keywords.length) return null;
    const soonest = keywords.reduce((min, k) => 
      new Date(k.expires_at) < new Date(min.expires_at) ? k : min
    );
    return getExpiryText(soonest.expires_at);
  }, [keywords]);

  // Check caps before adding
  const canAddKeyword = useMemo(() => {
    if (dailyAddCount >= MAX_DAILY_ADDS) {
      return { allowed: false, reason: `Daily limit reached (${MAX_DAILY_ADDS}/day)` };
    }
    if (selectedScope === "agent" && agentKeywordCount >= MAX_AGENT_KEYWORDS) {
      return { allowed: false, reason: `Personal keyword limit reached (${MAX_AGENT_KEYWORDS})` };
    }
    if (selectedScope === "global" && globalKeywordCount >= MAX_GLOBAL_KEYWORDS) {
      return { allowed: false, reason: `Global keyword limit reached (${MAX_GLOBAL_KEYWORDS})` };
    }
    return { allowed: true, reason: null };
  }, [selectedScope, agentKeywordCount, globalKeywordCount, dailyAddCount]);

  // Add keyword mutation
  const addKeywordMutation = useMutation({
    mutationFn: async ({ keyword, scope }: { keyword: string; scope: Scope }) => {
      if (!agencyId) throw new Error("No agency");
      if (!canAddKeyword.allowed) throw new Error(canAddKeyword.reason || "Cannot add keyword");
      
      const { error } = await supabase
        .from("high_intent_keywords")
        .insert({
          keyword: keyword.trim(),
          keyword_type: "custom",
          scope,
          agent_id: scope === "agent" ? userId : null,
          agency_id: agencyId,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          active: true,
          created_by: userId,
          match_type: "contains",
          case_sensitive: false,
          weight: 0.85,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["high-intent-keywords"] });
      queryClient.invalidateQueries({ queryKey: ["agent-keyword-count"] });
      queryClient.invalidateQueries({ queryKey: ["global-keyword-count"] });
      queryClient.invalidateQueries({ queryKey: ["daily-add-count"] });
      setNewKeyword("");
      toast({ title: "Keyword added" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete keyword mutation
  const deleteKeywordMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("high_intent_keywords")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["high-intent-keywords"] });
      queryClient.invalidateQueries({ queryKey: ["agent-keyword-count"] });
      queryClient.invalidateQueries({ queryKey: ["global-keyword-count"] });
      toast({ title: "Keyword removed" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Accept suggestion mutation
  const acceptSuggestionMutation = useMutation({
    mutationFn: async ({ suggestion, scope }: { suggestion: KeywordSuggestion; scope: Scope }) => {
      if (!agencyId) throw new Error("No agency");
      
      // Add the keyword
      const { error: insertError } = await supabase
        .from("high_intent_keywords")
        .insert({
          keyword: suggestion.keyword,
          keyword_type: suggestion.keyword_type,
          scope,
          agent_id: scope === "agent" ? userId : null,
          agency_id: agencyId,
          load_id: suggestion.load_id,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          active: true,
          created_by: userId,
          match_type: "contains",
          case_sensitive: false,
          weight: 0.85,
        });
      
      if (insertError) throw insertError;

      // Mark suggestion as accepted
      const { error: updateError } = await supabase
        .from("keyword_suggestions")
        .update({ 
          status: "accepted", 
          accepted_by: userId, 
          accepted_at: new Date().toISOString() 
        })
        .eq("id", suggestion.id);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["high-intent-keywords"] });
      queryClient.invalidateQueries({ queryKey: ["keyword-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["agent-keyword-count"] });
      queryClient.invalidateQueries({ queryKey: ["daily-add-count"] });
      toast({ title: "Suggestion accepted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Dismiss suggestion mutation
  const dismissSuggestionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("keyword_suggestions")
        .update({ status: "dismissed" })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keyword-suggestions"] });
      toast({ title: "Suggestion dismissed" });
    },
  });

  const handleAdd = () => {
    if (!newKeyword.trim()) return;
    if (!canAddKeyword.allowed) {
      toast({ title: "Cannot add keyword", description: canAddKeyword.reason, variant: "destructive" });
      return;
    }
    addKeywordMutation.mutate({ keyword: newKeyword, scope: selectedScope });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  // Separate keywords by scope
  const myKeywords = keywords.filter(k => k.scope === "agent" && k.agent_id === userId);
  const globalKeywords = keywords.filter(k => k.scope === "global");

  // Check if user can delete a keyword
  const canDelete = (keyword: Keyword) => {
    if (keyword.scope === "agent" && keyword.agent_id === userId) return true;
    if (keyword.scope === "global" && isAdmin) return true;
    return false;
  };

  return (
    <Tabs defaultValue="keywords" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 h-9">
        <TabsTrigger value="keywords" className="text-xs gap-1">
          <Tag className="h-3 w-3" />
          Keywords
        </TabsTrigger>
        <TabsTrigger value="suggestions" className="text-xs gap-1 relative">
          <Lightbulb className="h-3 w-3" />
          Suggestions
          {suggestions.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
              {suggestions.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="analytics" className="text-xs gap-1">
          <BarChart3 className="h-3 w-3" />
          Analytics
        </TabsTrigger>
      </TabsList>

      {/* Keywords Tab */}
      <TabsContent value="keywords" className="space-y-4 mt-0">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">High Intent Keywords</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[280px] text-xs">
                <p className="font-medium mb-1">How Keywords Work</p>
                <p>Keywords automatically flag leads as High-Intent when matched in call transcripts.</p>
                <p className="mt-1">• If matched, intent score is raised to at least 85%</p>
                <p>• Keywords expire automatically after 24 hours</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {nextExpiry && (
            <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              Resets in {nextExpiry}
            </Badge>
          )}
        </div>

        {/* Caps indicator */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className={cn(
            "flex items-center gap-1",
            agentKeywordCount >= MAX_AGENT_KEYWORDS && "text-destructive"
          )}>
            <User className="h-3 w-3" />
            {agentKeywordCount}/{MAX_AGENT_KEYWORDS}
          </span>
          {isAdmin && (
            <span className={cn(
              "flex items-center gap-1",
              globalKeywordCount >= MAX_GLOBAL_KEYWORDS && "text-destructive"
            )}>
              <Globe className="h-3 w-3" />
              {globalKeywordCount}/{MAX_GLOBAL_KEYWORDS}
            </span>
          )}
          <span className={cn(
            "flex items-center gap-1",
            dailyAddCount >= MAX_DAILY_ADDS && "text-destructive"
          )}>
            <TrendingUp className="h-3 w-3" />
            {dailyAddCount}/{MAX_DAILY_ADDS} today
          </span>
        </div>

        {/* Add Keyword Row */}
        <div className="flex gap-2">
          <Select
            value={selectedScope}
            onValueChange={(val) => setSelectedScope(val as Scope)}
            disabled={!isAdmin && selectedScope === "global"}
          >
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  My Keywords
                </div>
              </SelectItem>
              {isAdmin && (
                <SelectItem value="global">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" />
                    Global
                  </div>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          
          <Input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter keyword..."
            className="flex-1 h-9 text-sm"
          />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={handleAdd}
                disabled={!newKeyword.trim() || addKeywordMutation.isPending || !canAddKeyword.allowed}
                className="h-9 w-9"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            {!canAddKeyword.allowed && (
              <TooltipContent side="left" className="text-xs">
                {canAddKeyword.reason}
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Keywords List */}
        <div className="space-y-3">
          {/* My Keywords */}
          {myKeywords.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">My Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {myKeywords.map((kw) => {
                  const TypeIcon = getTypeIcon(kw.keyword_type);
                  return (
                    <Badge
                      key={kw.id}
                      variant="outline"
                      className={cn(
                        "gap-1.5 pr-1 bg-blue-500/5 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
                        "hover:bg-blue-500/10 transition-colors"
                      )}
                    >
                      <User className="h-3 w-3" />
                      <TypeIcon className="h-3 w-3 opacity-60" />
                      <span className="max-w-[100px] truncate">{kw.keyword}</span>
                      {canDelete(kw) && (
                        <button
                          onClick={() => deleteKeywordMutation.mutate(kw.id)}
                          className="ml-0.5 p-0.5 rounded hover:bg-blue-500/20 transition-colors"
                          disabled={deleteKeywordMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Global Keywords */}
          {globalKeywords.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Global Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {globalKeywords.map((kw) => {
                  const TypeIcon = getTypeIcon(kw.keyword_type);
                  return (
                    <Badge
                      key={kw.id}
                      variant="outline"
                      className={cn(
                        "gap-1.5 bg-amber-500/5 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800",
                        canDelete(kw) && "pr-1 hover:bg-amber-500/10 transition-colors"
                      )}
                    >
                      <Globe className="h-3 w-3" />
                      <TypeIcon className="h-3 w-3 opacity-60" />
                      <span className="max-w-[100px] truncate">{kw.keyword}</span>
                      {canDelete(kw) && (
                        <button
                          onClick={() => deleteKeywordMutation.mutate(kw.id)}
                          className="ml-0.5 p-0.5 rounded hover:bg-amber-500/20 transition-colors"
                          disabled={deleteKeywordMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && myKeywords.length === 0 && globalKeywords.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              No active keywords. Add one above.
            </p>
          )}
        </div>
      </TabsContent>

      {/* Suggestions Tab */}
      <TabsContent value="suggestions" className="space-y-4 mt-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Suggested Keywords</h3>
          <p className="text-[10px] text-muted-foreground">From booked loads</p>
        </div>

        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No suggestions available. Keywords will be suggested when loads are booked.
          </p>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => {
              const TypeIcon = getTypeIcon(s.keyword_type);
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/60 bg-card"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <TypeIcon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.keyword}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{s.keyword_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => acceptSuggestionMutation.mutate({ 
                            suggestion: s, 
                            scope: isAdmin ? "global" : "agent" 
                          })}
                          disabled={acceptSuggestionMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Add as {isAdmin ? "Global" : "My"} Keyword
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => dismissSuggestionMutation.mutate(s.id)}
                      disabled={dismissSuggestionMutation.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>

      {/* Analytics Tab */}
      <TabsContent value="analytics" className="space-y-4 mt-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Keyword Performance</h3>
          <Select value={analyticsFilter} onValueChange={(v) => setAnalyticsFilter(v as any)}>
            <SelectTrigger className="w-[80px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {analytics.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No keyword matches recorded yet.
          </p>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-12 gap-1 px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <div className="col-span-4">Keyword</div>
              <div className="col-span-2 text-center">Matches</div>
              <div className="col-span-2 text-center">Booked</div>
              <div className="col-span-2 text-center">Conv%</div>
              <div className="col-span-2 text-right">Last</div>
            </div>
            
            {/* Rows */}
            {analytics.slice(0, 15).map((a) => (
              <div
                key={a.keyword_id}
                className="grid grid-cols-12 gap-1 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-xs"
              >
                <div className="col-span-4 flex items-center gap-1.5 min-w-0">
                  {a.scope === "agent" ? (
                    <User className="h-3 w-3 text-blue-500 shrink-0" />
                  ) : (
                    <Globe className="h-3 w-3 text-amber-500 shrink-0" />
                  )}
                  <span className="truncate">{a.keyword}</span>
                </div>
                <div className="col-span-2 text-center tabular-nums">{a.match_count}</div>
                <div className="col-span-2 text-center tabular-nums text-green-600">{a.booked_count}</div>
                <div className="col-span-2 text-center tabular-nums">
                  <span className={cn(
                    a.conversion_rate >= 30 && "text-green-600 font-medium",
                    a.conversion_rate >= 10 && a.conversion_rate < 30 && "text-amber-600",
                    a.conversion_rate < 10 && "text-muted-foreground"
                  )}>
                    {a.conversion_rate}%
                  </span>
                </div>
                <div className="col-span-2 text-right text-muted-foreground">
                  {a.last_matched_at 
                    ? formatDistanceToNow(new Date(a.last_matched_at), { addSuffix: false })
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
