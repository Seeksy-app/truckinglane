import { useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Clock, Zap, Timer, Trophy, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { getDateWindow, getTimezoneLabel, getTodayDateString } from "@/lib/dateWindows";

interface AgentPerformanceBannerProps {
  userId?: string;
  agencyId?: string | null;
}

// Target constants for AEI formula (matching edge function)
const TARGET_AI_MINUTES = 60; // 60 minutes target per day
const TARGET_CALLBACK_SECONDS = 300; // 5 minutes (300 seconds) target

const TOOLTIP_CONTENT = {
  aiMinutes: {
    title: "AI Minutes Saved",
    body: "Estimated minutes saved by the AI handling calls and automations today. Updates automatically from call logs.",
  },
  highIntent: {
    title: "High Intent Calls",
    body: "Calls where the caller matched premium/high-intent signals (rate discussion, ready to book, urgent pickup, etc.). Higher is better.",
  },
  callbackSpeed: {
    title: "Callback Speed",
    body: "Median time from AI identifying high intent → an agent placing a follow-up call. Faster callbacks usually win the load.",
  },
  aei: {
    title: "Agent Efficiency Index",
    body: "0–100 score combining AI usage, high-intent focus, and callback speed. Designed to reward using the AI to close faster.",
  },
};

export const AgentPerformanceBanner = ({ userId, agencyId }: AgentPerformanceBannerProps) => {
  const queryClient = useQueryClient();
  const { timezone } = useUserTimezone();

  // Get timezone-aware date windows for today and yesterday
  const { todayWindow, yesterdayWindow, todayDateStr, yesterdayDateStr, timezoneLabel } = useMemo(() => {
    const todayWindow = getDateWindow("today", timezone);
    const yesterdayWindow = getDateWindow("yesterday", timezone);
    const todayDateStr = getTodayDateString(timezone);
    // Calculate yesterday's date string
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayDateStr = yesterdayDate.toISOString().split("T")[0];
    const timezoneLabel = getTimezoneLabel(timezone);
    return { todayWindow, yesterdayWindow, todayDateStr, yesterdayDateStr, timezoneLabel };
  }, [timezone]);

  // Fetch agent_daily_state for today (primary source of truth after midnight reset)
  const { data: dailyState } = useQuery({
    queryKey: ["agent-daily-state", userId, todayDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_daily_state")
        .select("*")
        .eq("agent_id", userId!)
        .eq("local_date", todayDateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  // Fetch yesterday's daily state for delta comparison
  const { data: yesterdayState } = useQuery({
    queryKey: ["agent-daily-state-yesterday", userId, yesterdayDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_daily_state")
        .select("*")
        .eq("agent_id", userId!)
        .eq("local_date", yesterdayDateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Fallback: Fetch today's calls if no daily_state exists (timezone-aware)
  const { data: todayCalls = [] } = useQuery({
    queryKey: ["agent-perf-calls-today", todayWindow.startTs, timezone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phone_calls")
        .select("id, duration_seconds, created_at")
        .gte("created_at", todayWindow.startTs)
        .lte("created_at", todayWindow.endTs);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId && !dailyState, // Only fetch if no daily_state
    refetchInterval: 30000,
  });

  // Fallback: Fetch yesterday's calls if no daily_state exists
  const { data: yesterdayCalls = [] } = useQuery({
    queryKey: ["agent-perf-calls-yesterday", yesterdayWindow.startTs, timezone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phone_calls")
        .select("id, duration_seconds, created_at")
        .gte("created_at", yesterdayWindow.startTs)
        .lte("created_at", yesterdayWindow.endTs);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId && !yesterdayState,
  });

  // Fallback: Fetch today's leads if no daily_state exists
  const { data: todayLeads = [] } = useQuery({
    queryKey: ["agent-perf-leads-today", todayWindow.startTs, timezone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, is_high_intent, created_at, claimed_at")
        .gte("created_at", todayWindow.startTs)
        .lte("created_at", todayWindow.endTs);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId && !dailyState,
    refetchInterval: 30000,
  });

  // Fallback: Fetch yesterday's leads if no daily_state exists
  const { data: yesterdayLeads = [] } = useQuery({
    queryKey: ["agent-perf-leads-yesterday", yesterdayWindow.startTs, timezone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, is_high_intent, created_at, claimed_at")
        .gte("created_at", yesterdayWindow.startTs)
        .lte("created_at", yesterdayWindow.endTs);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId && !yesterdayState,
  });

  // AEI Formula (exact as specified):
  // AEI = (AI_Minutes_Saved / Target_AI_Minutes) * 40
  //     + (High_Intent_Calls / Total_Calls) * 40
  //     + (1 - Avg_Callback_Seconds / Target_Callback_Seconds) * 20
  // Clamped 0-100
  const calculateAEI = (aiMinutes: number, highIntent: number, totalCalls: number, avgCallbackSecs: number): number => {
    const minutesComponent = Math.min(aiMinutes / TARGET_AI_MINUTES, 1) * 40;
    const intentRatio = totalCalls > 0 ? highIntent / totalCalls : 0;
    const intentComponent = intentRatio * 40;
    const speedRatio = avgCallbackSecs > 0 ? Math.max(0, 1 - avgCallbackSecs / TARGET_CALLBACK_SECONDS) : 1;
    const speedComponent = speedRatio * 20;
    
    return Math.min(100, Math.max(0, Math.round(minutesComponent + intentComponent + speedComponent)));
  };

  // Calculate metrics - prioritize agent_daily_state, fallback to computed
  const metrics = useMemo(() => {
    // If we have a reset daily_state for today, use those zeroed values
    if (dailyState) {
      const todayMinutes = Number(dailyState.ai_minutes) || 0;
      const todayHighIntent = dailyState.high_intent || 0;
      const todayTotalCalls = dailyState.ai_calls || 0;
      const todayCallbackSpeedSecs = Number(dailyState.callback_speed_seconds) || 0;
      const todayAEI = Number(dailyState.aei_score) || 0;
      
      // Yesterday from state or fallback
      const yesterdayMinutes = yesterdayState ? Number(yesterdayState.ai_minutes) || 0 : 
        yesterdayCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 60;
      const yesterdayHighIntent = yesterdayState ? yesterdayState.high_intent || 0 :
        yesterdayLeads.filter((l) => l.is_high_intent).length;
      const yesterdayTotalCalls = yesterdayState ? yesterdayState.ai_calls || 0 : yesterdayCalls.length;
      const yesterdayCallbackSpeedSecs = yesterdayState ? Number(yesterdayState.callback_speed_seconds) || 0 : 0;
      const yesterdayAEI = yesterdayState ? Number(yesterdayState.aei_score) || 0 :
        calculateAEI(yesterdayMinutes, yesterdayHighIntent, yesterdayTotalCalls, yesterdayCallbackSpeedSecs);
      
      return {
        aiMinutes: { today: Math.round(todayMinutes), delta: Math.round(todayMinutes - yesterdayMinutes) },
        highIntent: { today: todayHighIntent, delta: todayHighIntent - yesterdayHighIntent },
        totalCalls: { today: todayTotalCalls, yesterday: yesterdayTotalCalls },
        callbackSpeed: { 
          today: Math.round(todayCallbackSpeedSecs / 60),
          todaySecs: todayCallbackSpeedSecs,
          delta: Math.round((yesterdayCallbackSpeedSecs - todayCallbackSpeedSecs) / 60),
        },
        aei: { today: todayAEI, delta: todayAEI - yesterdayAEI },
      };
    }
    
    // Fallback: compute from raw data (for agents without daily_state yet)
    const todayMinutes = todayCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 60;
    const yesterdayMinutes = yesterdayCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 60;

    const todayHighIntent = todayLeads.filter((l) => l.is_high_intent).length;
    const yesterdayHighIntent = yesterdayLeads.filter((l) => l.is_high_intent).length;

    const todayTotalCalls = todayCalls.length;
    const yesterdayTotalCalls = yesterdayCalls.length;

    const calculateAvgCallbackSpeed = (leads: typeof todayLeads): number => {
      const claimedLeads = leads.filter((l) => l.claimed_at);
      if (claimedLeads.length === 0) return 0;
      const totalMs = claimedLeads.reduce((sum, l) => {
        const created = new Date(l.created_at).getTime();
        const claimed = new Date(l.claimed_at!).getTime();
        return sum + (claimed - created);
      }, 0);
      return totalMs / claimedLeads.length / 1000;
    };

    const todayCallbackSpeedSecs = calculateAvgCallbackSpeed(todayLeads);
    const yesterdayCallbackSpeedSecs = calculateAvgCallbackSpeed(yesterdayLeads);

    const todayAEI = calculateAEI(todayMinutes, todayHighIntent, todayTotalCalls, todayCallbackSpeedSecs);
    const yesterdayAEI = calculateAEI(yesterdayMinutes, yesterdayHighIntent, yesterdayTotalCalls, yesterdayCallbackSpeedSecs);

    return {
      aiMinutes: { today: Math.round(todayMinutes), delta: Math.round(todayMinutes - yesterdayMinutes) },
      highIntent: { today: todayHighIntent, delta: todayHighIntent - yesterdayHighIntent },
      totalCalls: { today: todayTotalCalls, yesterday: yesterdayTotalCalls },
      callbackSpeed: { 
        today: Math.round(todayCallbackSpeedSecs / 60),
        todaySecs: todayCallbackSpeedSecs,
        delta: Math.round((yesterdayCallbackSpeedSecs - todayCallbackSpeedSecs) / 60),
      },
      aei: { today: todayAEI, delta: todayAEI - yesterdayAEI },
    };
  }, [dailyState, yesterdayState, todayCalls, yesterdayCalls, todayLeads, yesterdayLeads]);

  // Persist daily stats to agent_daily_stats table (for historical analytics)
  const persistStats = useMutation({
    mutationFn: async () => {
      if (!userId || !agencyId) return;
      
      const { error } = await supabase
        .from("agent_daily_stats")
        .upsert({
          user_id: userId,
          agency_id: agencyId,
          stat_date: todayDateStr,
          ai_minutes_saved: metrics.aiMinutes.today,
          high_intent_calls: metrics.highIntent.today,
          total_calls: metrics.totalCalls.today,
          avg_callback_seconds: metrics.callbackSpeed.todaySecs,
          aei_score: metrics.aei.today,
        }, {
          onConflict: 'user_id,stat_date',
        });
      
      if (error) {
        console.error("Failed to persist agent stats:", error);
        throw error;
      }
    },
  });

  // Persist stats whenever metrics change (but only if computed from raw data, not state)
  useEffect(() => {
    if (userId && agencyId && !dailyState && metrics.aei.today > 0) {
      persistStats.mutate();
    }
  }, [userId, agencyId, dailyState, metrics.aei.today, metrics.aiMinutes.today, metrics.highIntent.today]);

  const DeltaBadge = ({ value, inverted = false, suffix = "" }: { value: number; inverted?: boolean; suffix?: string }) => {
    const isPositive = inverted ? value < 0 : value > 0;
    const isNeutral = value === 0;
    const displayValue = inverted ? -value : value;
    
    if (isNeutral) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {isPositive ? "+" : ""}{displayValue}{suffix}
      </span>
    );
  };

  const getAEIColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  const getMotivationalMessage = () => {
    const { aei, aiMinutes, callbackSpeed } = metrics;
    
    if (aei.today >= 80) {
      return { text: "🔥 Top 20% dispatcher pace!", color: "text-emerald-600" };
    }
    if (aei.delta > 0 && aei.delta >= 10) {
      return { text: `📈 You're ${aei.delta}% better than yesterday!`, color: "text-emerald-600" };
    }
    if (aiMinutes.today > 0) {
      return { text: `⏱️ You saved ${aiMinutes.today} minutes today`, color: "text-primary" };
    }
    if (callbackSpeed.delta > 0) {
      return { text: `⚡ ${callbackSpeed.delta}m faster callbacks today`, color: "text-blue-600" };
    }
    if (aei.today >= 60) {
      return { text: "💪 Keep pushing!", color: "text-amber-600" };
    }
    return { text: "📊 Make your first callback!", color: "text-muted-foreground" };
  };

  const motivation = getMotivationalMessage();

  interface KPICardProps {
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    value: string | number;
    delta: React.ReactNode;
    tooltipKey: keyof typeof TOOLTIP_CONTENT;
    valueClassName?: string;
  }

  const KPICard = ({ icon, iconBg, label, value, delta, tooltipKey, valueClassName = "" }: KPICardProps) => (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <div 
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background/60 border border-border/40 hover:bg-background/80 hover:border-border/60 transition-colors cursor-help focus:outline-none focus:ring-2 focus:ring-primary/50"
          tabIndex={0}
        >
          <div className={`p-1.5 rounded-md ${iconBg}`}>
            {icon}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Info className="h-3 w-3 text-muted-foreground/60" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-semibold ${valueClassName || "text-foreground"}`}>{value}</span>
              {delta}
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent 
        side="bottom" 
        className="max-w-xs p-3"
        sideOffset={8}
      >
        <p className="font-semibold text-foreground mb-1">{TOOLTIP_CONTENT[tooltipKey].title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{TOOLTIP_CONTENT[tooltipKey].body}</p>
        <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/50">
          Scope: Agent • Range: Today • TZ: {timezoneLabel}
        </p>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider>
      <div className="bg-gradient-to-r from-primary/5 via-primary/8 to-primary/5 border border-border/50 rounded-lg px-3 py-2 mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* KPI Cards */}
          <div className="flex items-center gap-2 flex-wrap">
            <KPICard
              icon={<Clock className="h-3.5 w-3.5 text-primary" />}
              iconBg="bg-primary/15"
              label="AI Minutes"
              value={`${metrics.aiMinutes.today}m`}
              delta={<DeltaBadge value={metrics.aiMinutes.delta} suffix="m" />}
              tooltipKey="aiMinutes"
            />

            <KPICard
              icon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
              iconBg="bg-amber-500/15"
              label="High Intent"
              value={metrics.highIntent.today}
              delta={<DeltaBadge value={metrics.highIntent.delta} />}
              tooltipKey="highIntent"
            />

            <KPICard
              icon={<Timer className="h-3.5 w-3.5 text-blue-500" />}
              iconBg="bg-blue-500/15"
              label="Callback Speed"
              value={`${metrics.callbackSpeed.today}m`}
              delta={<DeltaBadge value={metrics.callbackSpeed.delta} inverted suffix="m" />}
              tooltipKey="callbackSpeed"
            />

            <KPICard
              icon={<Trophy className="h-3.5 w-3.5 text-primary" />}
              iconBg="bg-primary/15"
              label="AEI Score"
              value={metrics.aei.today}
              delta={<DeltaBadge value={metrics.aei.delta} />}
              tooltipKey="aei"
              valueClassName={getAEIColor(metrics.aei.today)}
            />
          </div>

          {/* Motivational message */}
          <div className="hidden lg:flex items-center gap-2 text-sm ml-auto">
            <span className={`font-medium ${motivation.color}`}>{motivation.text}</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
