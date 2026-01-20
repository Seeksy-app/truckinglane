import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import { LeadsTable } from "@/components/dashboard/LeadsTable";
import { DashboardStats, DashboardMode } from "@/components/dashboard/DashboardStats";
import { LoadsTable } from "@/components/loads/LoadsTable";
import { AppHeader } from "@/components/AppHeader";
import { useToast } from "@/hooks/use-toast";
import { useLoads } from "@/hooks/useLoads";
import { useRealtimeDashboard } from "@/hooks/useRealtimeDashboard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { X, CheckCircle, Package, RotateCcw, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartSearchInput } from "@/components/dashboard/SmartSearchInput";
import { normalizeStateSearch } from "@/lib/stateMapping";
import { AIAssistantDrawer } from "@/components/dashboard/AIAssistantDrawer";
import { IntelligenceRail } from "@/components/dashboard/IntelligenceRail";
import { InternalChatRail } from "@/components/dashboard/InternalChatRail";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { DashboardCallsTable } from "@/components/dashboard/DashboardCallsTable";
import { AgentPerformanceBanner } from "@/components/dashboard/AgentPerformanceBanner";
import { useRailsStore } from "@/hooks/useRailsStore";
import { useUserRole } from "@/hooks/useUserRole";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { getDateWindow, getTodayDateString } from "@/lib/dateWindows";
import { useLeadNotifications } from "@/hooks/useLeadNotifications";
import { CreateLoadModal } from "@/components/loads/CreateLoadModal";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;
type LeadStatus = "pending" | "claimed" | "booked" | "closed";

// System reset banner - shows once for admins after go-live reset
const RESET_BANNER_KEY = "system_reset_banner_dismissed_20251226";

const modeTitles: Record<DashboardMode, string> = {
  open: "Open Loads",
  claimed: "Claimed",
  pending: "Leads",
  calls: "AI Calls",
  booked: "Booked Loads",
};

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role, agencyId: userAgencyId } = useUserRole();
  const { impersonatedAgencyId, isImpersonating } = useImpersonation();
  const { timezone } = useUserTimezone();
  const isAdmin = role === "agency_admin" || role === "super_admin";
  
  // Enable browser push notifications for new leads
  useLeadNotifications();
  
  // Use impersonated agency if set, otherwise use user's agency
  const effectiveAgencyId = isImpersonating ? impersonatedAgencyId : userAgencyId;
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<DashboardMode>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "my">("all");
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [createLoadOpen, setCreateLoadOpen] = useState(false);
  const [highlightedLeadPhone, setHighlightedLeadPhone] = useState<string | null>(null);
  const [highlightedLoadNumber, setHighlightedLoadNumber] = useState<string | null>(null);
  const [showResetBanner, setShowResetBanner] = useState(false);
  
  // Check if reset banner should be shown (admins only, once)
  useEffect(() => {
    if (isAdmin && typeof window !== "undefined") {
      const dismissed = localStorage.getItem(RESET_BANNER_KEY);
      if (!dismissed) {
        setShowResetBanner(true);
      }
    }
  }, [isAdmin]);
  
  const dismissResetBanner = () => {
    localStorage.setItem(RESET_BANNER_KEY, "true");
    setShowResetBanner(false);
  };
  
  // Rails store for persistent state
  const {
    hydrated,
    leftOpen,
    rightOpen,
    leftWidth,
    rightWidth,
    setLeftOpen,
    setRightOpen,
    setLeftWidth,
    setRightWidth,
  } = useRailsStore();

  // Keyboard shortcuts for rails
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      
      // ⌘/Ctrl + K = toggle right rail
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        setRightOpen(!rightOpen);
      }
      
      // ⌘/Ctrl + Shift + K = toggle left rail
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        setLeftOpen(!leftOpen);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [leftOpen, rightOpen, setLeftOpen, setRightOpen]);
  
  // Handle URL params for deep-linking to leads/loads
  useEffect(() => {
    const leadPhone = searchParams.get("lead");
    const loadNumber = searchParams.get("load");
    
    if (leadPhone) {
      // Switch to pending mode and highlight the lead
      setMode("pending");
      setHighlightedLeadPhone(leadPhone);
      // Clear the param after consuming it
      searchParams.delete("lead");
      setSearchParams(searchParams, { replace: true });
    }
    
    if (loadNumber) {
      // Switch to open mode and highlight the load
      setMode("open");
      setHighlightedLoadNumber(loadNumber);
      // Clear the param after consuming it
      searchParams.delete("load");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  // Enable real-time updates
  useRealtimeDashboard();
  
  // Fetch user's agency_id first (used by other queries)
  const { data: agencyMember } = useQuery({
    queryKey: ["agency_member", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agency_members")
        .select("agency_id")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get today's date string in user's timezone
  const todayDateStr = useMemo(() => getTodayDateString(timezone), [timezone]);
  
  // Initialize agent_daily_state for today if it doesn't exist (zeros out KPIs)
  const { data: dailyStateExists } = useQuery({
    queryKey: ["agent-daily-state-exists", user?.id, todayDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_daily_state")
        .select("id")
        .eq("agent_id", user!.id)
        .eq("local_date", todayDateStr)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!agencyMember?.agency_id,
  });

  // Create zeroed daily state if it doesn't exist for today
  useEffect(() => {
    if (user && agencyMember?.agency_id && dailyStateExists === false) {
      supabase
        .from("agent_daily_state")
        .insert({
          agent_id: user.id,
          agency_id: agencyMember.agency_id,
          local_date: todayDateStr,
          timezone: timezone,
          ai_minutes: 0,
          high_intent: 0,
          callback_speed_seconds: 0,
          aei_score: 0,
          ai_calls: 0,
          booked: 0,
          leads_today_ids: [],
          open_loads_today_ids: [],
          recent_calls_today_ids: [],
          engaged_calls_today_ids: [],
          quick_hangups_today_ids: [],
        })
        .then(({ error }) => {
          if (error && !error.message.includes("duplicate")) {
            console.error("Failed to initialize daily state:", error);
          } else {
            queryClient.invalidateQueries({ queryKey: ["agent-daily-state"] });
          }
        });
    }
  }, [user, agencyMember?.agency_id, dailyStateExists, todayDateStr, timezone, queryClient]);
  
  // Fetch loads
  const { loads, loading: loadsLoading, refetch: refetchLoads } = useLoads();

  // Fetch leads (filtered by effective agency - supports impersonation)
  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["leads", effectiveAgencyId],
    queryFn: async () => {
      if (!effectiveAgencyId) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("agency_id", effectiveAgencyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!user && !!effectiveAgencyId,
  });

  // Fetch calls from ai_call_summaries for rich data (agency filtered - supports impersonation)
  const { data: rawCalls = [], isLoading: callsLoading } = useQuery({
    queryKey: ["ai_calls_dashboard", effectiveAgencyId],
    queryFn: async () => {
      if (!effectiveAgencyId) return [];
      const { data, error } = await supabase
        .from("ai_call_summaries")
        .select("id, created_at, duration_secs, call_outcome, termination_reason, summary_title, summary_short, external_number, conversation_id, is_high_intent, carrier_name, carrier_usdot, transcript")
        .eq("agency_id", effectiveAgencyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!effectiveAgencyId,
  });

  // Build a map of phone -> lead status for enriching calls
  const phoneToLeadStatus = useMemo(() => {
    const map = new Map<string, 'pending' | 'claimed' | 'closed' | 'booked'>();
    leads.forEach(lead => {
      if (lead.caller_phone) {
        // Normalize phone to match
        const phone = lead.caller_phone.replace(/\D/g, '');
        // Keep the most recent/most progressed status
        const existing = map.get(phone);
        if (!existing || 
            (existing === 'pending' && lead.status !== 'pending') ||
            (existing === 'claimed' && (lead.status === 'booked' || lead.status === 'closed')) ||
            (existing === 'closed' && lead.status === 'booked')) {
          map.set(phone, lead.status);
        }
      }
    });
    return map;
  }, [leads]);

  // Enrich calls with lead status
  const calls = useMemo(() => {
    return rawCalls.map(call => {
      const phone = (call.external_number || '').replace(/\D/g, '');
      const leadStatus = phone ? phoneToLeadStatus.get(phone) : null;
      return { ...call, lead_status: leadStatus };
    });
  }, [rawCalls, phoneToLeadStatus]);

  // Mutations for leads
  const claimMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("leads")
        .update({
          status: "claimed" as LeadStatus,
          claimed_by: user?.id,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", leadId)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead claimed successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to claim lead", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, status, action }: { leadId: string; status: LeadStatus; action?: 'release' | 'reopen' }) => {
      const updateData: Record<string, unknown> = { status };
      if (action === "release" || action === "reopen") {
        updateData.claimed_by = null;
        updateData.claimed_at = null;
        updateData.booked_by = null;
        updateData.booked_at = null;
        updateData.closed_at = null;
      } else if (status === "booked") {
        updateData.booked_at = new Date().toISOString();
        updateData.booked_by = user?.id;
      } else if (status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }
      const { error } = await supabase.from("leads").update(updateData).eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead status updated" });
    },
    onError: (error) => {
      toast({ title: "Failed to update lead", description: error.message, variant: "destructive" });
    },
  });

  // Backfill mutation for syncing ElevenLabs calls
  const backfillMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("backfill-elevenlabs-calls", {
        body: { days_back: 30 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["ai_calls_dashboard"] });
      toast({
        title: "Sync complete",
        description: `Processed ${data.processed} calls, created ${data.leads_created} leads`,
      });
    },
    onError: (error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  // Compute timezone-aware "today" window for filtering
  const todayWindow = useMemo(() => {
    return getDateWindow("today", timezone);
  }, [timezone]);

  // Fetch agent_daily_state for current user's today KPIs
  const { data: agentDailyState } = useQuery({
    queryKey: ["agent-daily-state-kpis", user?.id, todayDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_daily_state")
        .select("*")
        .eq("agent_id", user!.id)
        .eq("local_date", todayDateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Stats for KPIs - AGENT VIEW uses agent_daily_state (resettable daily)
  // These are the OPERATIONAL metrics that reset at midnight
  const stats = useMemo(() => {
    const todayStart = new Date(todayWindow.startTs);
    const todayEnd = new Date(todayWindow.endTs);
    
    // Open loads - real-time count (these don't reset, they show current inventory)
    const openLoadsCount = loads.filter((l) => l.status === "open" && l.is_active).length;
    
    // Claimed TODAY only - filter by claimed_at timestamp
    const claimedTodayLoads = loads.filter((l) => {
      if (l.status !== "claimed" || !l.is_active || !l.claimed_at) return false;
      const claimedAt = new Date(l.claimed_at);
      return claimedAt >= todayStart && claimedAt <= todayEnd;
    }).length;
    const claimedTodayLeads = leads.filter((l) => {
      if (l.status !== "claimed" || !l.claimed_at) return false;
      const claimedAt = new Date(l.claimed_at);
      return claimedAt >= todayStart && claimedAt <= todayEnd;
    }).length;
    const claimedTodayCount = claimedTodayLoads + claimedTodayLeads;
    
    // Leads created TODAY only - filter by created_at timestamp
    const pendingLeadsTodayCount = leads.filter((l) => {
      if (l.status !== "pending") return false;
      const createdAt = new Date(l.created_at);
      return createdAt >= todayStart && createdAt <= todayEnd;
    }).length;
    
    // AI Calls TODAY - always compute from calls data (agent_daily_state may not be synced)
    const aiCallsTodayCount = calls.filter((c) => {
      const createdAt = new Date(c.created_at);
      return createdAt >= todayStart && createdAt <= todayEnd;
    }).length;
    
    // Booked TODAY - compute from loads
    const bookedTodayCount = loads.filter((l) => {
      if (!l.booked_at) return false;
      const bookedAt = new Date(l.booked_at);
      return bookedAt >= todayStart && bookedAt <= todayEnd;
    }).length;
    
    return {
      openToday: openLoadsCount,
      claimedToday: claimedTodayCount,
      pendingToday: pendingLeadsTodayCount,
      aiCallsToday: aiCallsTodayCount,
      bookedToday: bookedTodayCount,
    };
  }, [loads, leads, calls, todayWindow]);

  // Filtered data for each mode
  const filteredOpenLoads = useMemo(() => {
    let result = loads.filter((l) => l.status === "open" && l.is_active);
    if (ownerFilter === "my" && user) {
      result = result.filter((l) => l.booked_by === user.id);
    }
    if (searchQuery.trim()) {
      const searchTerms = normalizeStateSearch(searchQuery);
      const isStateAbbr = searchQuery.trim().length === 2 && /^[a-zA-Z]{2}$/.test(searchQuery.trim());
      result = result.filter((l) => {
        const loadNumber = l.load_number?.toLowerCase() || "";
        const pickupCity = l.pickup_city?.toLowerCase().trim() || "";
        const pickupState = l.pickup_state?.toLowerCase().trim() || "";
        const destCity = l.dest_city?.toLowerCase().trim() || "";
        const destState = l.dest_state?.toLowerCase().trim() || "";
        return searchTerms.some((term) => {
          // For 2-letter state abbreviations, use exact match on state fields
          if (isStateAbbr && term.length === 2) {
            return pickupState === term || destState === term || loadNumber.includes(term);
          }
          return (
            loadNumber.includes(term) ||
            pickupCity.includes(term) ||
            pickupState.includes(term) ||
            destCity.includes(term) ||
            destState.includes(term)
          );
        });
      });
    }
    return result;
  }, [loads, ownerFilter, searchQuery, user]);

  const filteredClaimedLoads = useMemo(() => {
    let result = loads.filter((l) => l.status === "claimed" && l.is_active);
    if (ownerFilter === "my" && user) {
      result = result.filter((l) => l.claimed_by === user.id);
    }
    if (searchQuery.trim()) {
      const searchTerms = normalizeStateSearch(searchQuery);
      const isStateAbbr = searchQuery.trim().length === 2 && /^[a-zA-Z]{2}$/.test(searchQuery.trim());
      result = result.filter((l) => {
        const loadNumber = l.load_number?.toLowerCase() || "";
        const pickupCity = l.pickup_city?.toLowerCase().trim() || "";
        const pickupState = l.pickup_state?.toLowerCase().trim() || "";
        const destCity = l.dest_city?.toLowerCase().trim() || "";
        const destState = l.dest_state?.toLowerCase().trim() || "";
        return searchTerms.some((term) => {
          if (isStateAbbr && term.length === 2) {
            return pickupState === term || destState === term || loadNumber.includes(term);
          }
          return (
            loadNumber.includes(term) ||
            pickupCity.includes(term) ||
            pickupState.includes(term) ||
            destCity.includes(term) ||
            destState.includes(term)
          );
        });
      });
    }
    return result;
  }, [loads, ownerFilter, searchQuery, user]);

  // Pending leads only (unclaimed) - TODAY ONLY to match KPI
  const filteredPendingLeads = useMemo(() => {
    const todayStart = new Date(todayWindow.startTs);
    const todayEnd = new Date(todayWindow.endTs);
    
    let result = leads.filter((l) => {
      if (l.status !== "pending") return false;
      const createdAt = new Date(l.created_at);
      return createdAt >= todayStart && createdAt <= todayEnd;
    });
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.caller_name?.toLowerCase().includes(q) ||
        l.caller_phone?.toLowerCase().includes(q) ||
        l.caller_company?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, searchQuery, todayWindow]);

  // Claimed leads only
  const filteredClaimedLeads = useMemo(() => {
    let result = leads.filter((l) => l.status === "claimed");
    if (ownerFilter === "my" && user) {
      result = result.filter((l) => l.claimed_by === user.id);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.caller_name?.toLowerCase().includes(q) ||
        l.caller_phone?.toLowerCase().includes(q) ||
        l.caller_company?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, searchQuery, ownerFilter, user]);

  const filteredCalls = useMemo(() => {
    const todayStart = new Date(todayWindow.startTs);
    const todayEnd = new Date(todayWindow.endTs);
    
    let result = calls.filter((c) => {
      const createdAt = new Date(c.created_at);
      return createdAt >= todayStart && createdAt <= todayEnd;
    });
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) =>
        c.external_number?.toLowerCase().includes(q) ||
        c.summary_title?.toLowerCase().includes(q) ||
        c.summary_short?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [calls, todayWindow, searchQuery]);

  const filteredBookedLoads = useMemo(() => {
    const todayStart = new Date(todayWindow.startTs);
    const todayEnd = new Date(todayWindow.endTs);
    
    let result = loads.filter((l) => {
      if (l.status !== "booked" || !l.booked_at) return false;
      const bookedAt = new Date(l.booked_at);
      return bookedAt >= todayStart && bookedAt <= todayEnd;
    });
    if (ownerFilter === "my" && user) {
      result = result.filter((l) => l.booked_by === user.id);
    }
    if (searchQuery.trim()) {
      const searchTerms = normalizeStateSearch(searchQuery);
      const isStateAbbr = searchQuery.trim().length === 2 && /^[a-zA-Z]{2}$/.test(searchQuery.trim());
      result = result.filter((l) => {
        const loadNumber = l.load_number?.toLowerCase() || "";
        const pickupCity = l.pickup_city?.toLowerCase().trim() || "";
        const pickupState = l.pickup_state?.toLowerCase().trim() || "";
        const destCity = l.dest_city?.toLowerCase().trim() || "";
        const destState = l.dest_state?.toLowerCase().trim() || "";
        return searchTerms.some((term) => {
          if (isStateAbbr && term.length === 2) {
            return pickupState === term || destState === term || loadNumber.includes(term);
          }
          return (
            loadNumber.includes(term) ||
            pickupCity.includes(term) ||
            pickupState.includes(term) ||
            destCity.includes(term) ||
            destState.includes(term)
          );
        });
      });
    }
    return result;
  }, [loads, todayWindow, ownerFilter, searchQuery, user]);

  // Get current filtered data based on mode
  const getCurrentData = () => {
    switch (mode) {
      case "open": return filteredOpenLoads;
      case "claimed": return [...filteredClaimedLoads, ...filteredClaimedLeads];
      case "pending": return filteredPendingLeads;
      case "calls": return filteredCalls;
      case "booked": return filteredBookedLoads;
    }
  };

  // Owner filter label based on mode
  const ownerLabels: Record<DashboardMode, { all: string; my: string }> = {
    open: { all: "All Loads", my: "My Loads" },
    claimed: { all: "All Claimed", my: "My Claimed" },
    pending: { all: "All Leads", my: "My Leads" },
    calls: { all: "All Calls", my: "My Calls" },
    booked: { all: "All Booked", my: "My Booked" },
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      {/* System Reset Banner - Admin only, dismissible */}
      {showResetBanner && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                <span className="font-semibold">System reset completed.</span> Tracking restarted — fresh data begins today.
              </p>
            </div>
            <button
              onClick={dismissResetBanner}
              className="p-1 rounded hover:bg-emerald-500/20 transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </button>
          </div>
        </div>
      )}
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Welcome Banner with name + weather */}
        <WelcomeBanner />
        
        {/* Agent Performance Banner */}
        <AgentPerformanceBanner userId={user.id} agencyId={agencyMember?.agency_id} />
        
        {/* KPI Cards as view toggles */}
        <DashboardStats stats={stats} activeMode={mode} onModeChange={setMode} />

        {/* Controls bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">{modeTitles[mode]}</h2>
            <span className="text-sm text-muted-foreground">
              ({getCurrentData().length} items)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
              {backfillMutation.isPending ? "Syncing..." : "Sync Calls"}
            </Button>
            <Button size="sm" onClick={() => setCreateLoadOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Load
            </Button>
          </div>
        </div>

        {/* Global search + owner toggle */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <SmartSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search load #, city, state, phone..."
            loads={loads}
          />
          <ToggleGroup
            type="single"
            value={ownerFilter}
            onValueChange={(v) => v && setOwnerFilter(v as "all" | "my")}
            className="border border-border rounded-md bg-card"
          >
            <ToggleGroupItem value="all" className="px-4 text-sm data-[state=on]:bg-muted">
              {ownerLabels[mode].all}
            </ToggleGroupItem>
            <ToggleGroupItem value="my" className="px-4 text-sm data-[state=on]:bg-muted">
              {ownerLabels[mode].my}
            </ToggleGroupItem>
          </ToggleGroup>
          {(searchQuery || ownerFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setOwnerFilter("all");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          )}
        </div>

        {/* Single unified table based on mode */}
        {mode === "open" && (
          <LoadsTable loads={filteredOpenLoads} loading={loadsLoading} onRefresh={refetchLoads} />
        )}

        {mode === "claimed" && (
          <div className="space-y-6">
            {/* Claimed Loads */}
            {filteredClaimedLoads.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Claimed Loads ({filteredClaimedLoads.length})</h3>
                <LoadsTable loads={filteredClaimedLoads} loading={loadsLoading} onRefresh={refetchLoads} />
              </div>
            )}
            
            {/* Claimed Leads */}
            {filteredClaimedLeads.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Claimed Leads ({filteredClaimedLeads.length})</h3>
                <LeadsTable
                  leads={filteredClaimedLeads}
                  isLoading={leadsLoading}
                  currentUserId={user.id}
                  agencyId={agencyMember?.agency_id}
                  onClaimLead={(id) => claimMutation.mutate(id)}
                  onUpdateStatus={(id, status, action) => updateStatusMutation.mutate({ leadId: id, status, action })}
                  showClaimedBy
                />
              </div>
            )}
            
            {/* Empty state */}
            {filteredClaimedLoads.length === 0 && filteredClaimedLeads.length === 0 && !loadsLoading && !leadsLoading && (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-lg font-medium text-foreground">No claimed items</p>
                <p className="text-sm text-muted-foreground mt-1">Claim a load or lead to get started</p>
              </div>
            )}
          </div>
        )}

        {mode === "pending" && (
          <LeadsTable
            leads={filteredPendingLeads}
            isLoading={leadsLoading}
            currentUserId={user.id}
            agencyId={agencyMember?.agency_id}
            onClaimLead={(id) => claimMutation.mutate(id)}
            onUpdateStatus={(id, status, action) => updateStatusMutation.mutate({ leadId: id, status, action })}
            highlightPhone={highlightedLeadPhone}
            onHighlightConsumed={() => setHighlightedLeadPhone(null)}
          />
        )}

        {mode === "calls" && (
          <DashboardCallsTable calls={filteredCalls} loading={callsLoading} />
        )}

        {mode === "booked" && (
          <LoadsTable loads={filteredBookedLoads} loading={loadsLoading} onRefresh={refetchLoads} />
        )}
      </div>

      {/* Only render rails after hydration to prevent flicker */}
      {hydrated && (
        <>
          {/* Left Rail - Internal Chat */}
          <InternalChatRail
            open={leftOpen}
            onOpenChange={setLeftOpen}
            width={leftWidth}
            onWidthChange={setLeftWidth}
          />

          {/* Right Rail - Intelligence */}
          <IntelligenceRail
            open={rightOpen}
            onOpenChange={setRightOpen}
            agencyId={agencyMember?.agency_id || null}
            onOpenChat={() => {
              setAiDrawerOpen(true);
              setRightOpen(false);
            }}
            width={rightWidth}
            onWidthChange={setRightWidth}
          />
        </>
      )}

      {/* AI Assistant Drawer (full chat) */}
      <AIAssistantDrawer 
        open={aiDrawerOpen} 
        onOpenChange={setAiDrawerOpen} 
        agencyId={agencyMember?.agency_id || null}
      />

      {/* Create Load Modal */}
      <CreateLoadModal open={createLoadOpen} onOpenChange={setCreateLoadOpen} />
    </div>
  );
};

export default Dashboard;
