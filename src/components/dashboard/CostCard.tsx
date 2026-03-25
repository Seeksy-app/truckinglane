import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp } from "lucide-react";

interface CostData {
  daily: number;
  monthly: number;
  allTime: number;
  breakdown: { name: string; monthly: number }[];
}

const ELEVENLABS_RATE_PER_MIN = 0.05; // ~$0.05/min for conversational AI

export function CostCard() {
  const { data: costs, isLoading } = useQuery({
    queryKey: ["platform-costs"],
    queryFn: async (): Promise<CostData> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Fetch ElevenLabs conversation stats via edge function proxy
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/get-cost-stats`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabaseKey,
          },
        }
      );

      if (!resp.ok) {
        // Fallback: estimate from AI call logs in Supabase
        const now = Math.floor(Date.now() / 1000);
        const dayAgo = now - 86400;
        const monthAgo = now - 30 * 86400;

        const { data: allCalls } = await supabase
          .from("phone_calls")
          .select("duration_seconds, created_at")
          .order("created_at", { ascending: false })
          .limit(500);

        const calls = allCalls || [];
        const dayCalls = calls.filter(c => new Date(c.created_at).getTime() / 1000 > dayAgo);
        const monthCalls = calls.filter(c => new Date(c.created_at).getTime() / 1000 > monthAgo);

        const dayMins = dayCalls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60;
        const monthMins = monthCalls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60;
        const allMins = calls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60;

        const dailyEL = dayMins * ELEVENLABS_RATE_PER_MIN;
        const monthlyEL = monthMins * ELEVENLABS_RATE_PER_MIN;
        const allTimeEL = allMins * ELEVENLABS_RATE_PER_MIN;

        // Firecrawl: ~$0.005 per page crawled (rough estimate)
        const { count: crawlCount } = await supabase
          .from("accounts")
          .select("*", { count: "exact", head: true });
        const firecrawlCost = (crawlCount || 0) * 0.005;

        return {
          daily: dailyEL,
          monthly: monthlyEL + firecrawlCost,
          allTime: allTimeEL + firecrawlCost,
          breakdown: [
            { name: "ElevenLabs AI", monthly: monthlyEL },
            { name: "Firecrawl", monthly: firecrawlCost },
          ],
        };
      }

      return await resp.json();
    },
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });

  if (isLoading) {
    return (
      <Card className="border-2 bg-card border-border">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            <span className="text-sm font-semibold text-muted-foreground">Platform Cost</span>
          </div>
          <div className="text-2xl font-bold text-muted-foreground animate-pulse">—</div>
        </CardContent>
      </Card>
    );
  }

  const monthly = costs?.monthly ?? 0;
  const daily = costs?.daily ?? 0;
  const allTime = costs?.allTime ?? 0;

  return (
    <Card className="border-2 bg-card border-border hover:border-green-500/50 hover:bg-green-500/5 transition-all duration-200">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <DollarSign className="h-4 w-4 text-green-500" />
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold text-foreground">${monthly.toFixed(2)}</div>
        <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
          <span className="text-xs">This month</span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs">${daily.toFixed(2)}/day</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          All time: ${allTime.toFixed(2)}
        </div>
      </CardContent>
    </Card>
  );
}
