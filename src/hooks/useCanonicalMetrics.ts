import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CanonicalMetrics {
  ai_calls: number;
  ai_calls_with_phone: number;
  leads_created: number;
  leads_claimed: number;
  leads_booked: number;
  leads_closed: number;
  leads_pending: number;
  engaged_calls: number;
  quick_hangups: number;
  high_intent: number;
  total_minutes: number;
  avg_claim_seconds: number;
  claim_rate: number;
  book_rate: number;
  close_rate: number;
  conversion_rate: number;
}

export interface AnalyticsKPIs {
  ai_calls: number;
  ai_minutes: number;
  high_intent_count: number;
  high_intent_delta: number;
  callback_speed_seconds_avg: number | null;
  aei_score: number;
  booked_count: number;
  leads_count: number;
  quick_hangups_count: number;
  engaged_calls: number;
}

interface UseCanonicalMetricsOptions {
  agencyId: string | null;
  agentId?: string | null;
  startTs?: Date | null;
  endTs?: Date | null;
  enabled?: boolean;
}

/**
 * Hook to fetch canonical metrics from the single source of truth RPC.
 * All Analytics, Reports, and Dashboard should use this hook for metrics.
 */
export function useCanonicalMetrics({
  agencyId,
  agentId = null,
  startTs = null,
  endTs = null,
  enabled = true,
}: UseCanonicalMetricsOptions) {
  return useQuery({
    queryKey: [
      "canonical-metrics",
      agencyId,
      agentId,
      startTs?.toISOString(),
      endTs?.toISOString(),
    ],
    queryFn: async (): Promise<CanonicalMetrics | null> => {
      if (!agencyId) return null;

      const { data, error } = await supabase.rpc("get_metrics_summary", {
        p_agency_id: agencyId,
        p_agent_id: agentId || null,
        p_start_ts: startTs?.toISOString() || null,
        p_end_ts: endTs?.toISOString() || null,
      });

      if (error) {
        console.error("Error fetching canonical metrics:", error);
        throw error;
      }

      return data as unknown as CanonicalMetrics;
    },
    enabled: enabled && !!agencyId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Hook to fetch analytics KPIs including AI Minutes, High Intent, Callback Speed, AEI Score
 */
export function useAnalyticsKPIs({
  agencyId,
  agentId = null,
  startTs = null,
  endTs = null,
  enabled = true,
}: UseCanonicalMetricsOptions) {
  return useQuery({
    queryKey: [
      "analytics-kpis",
      agencyId,
      agentId,
      startTs?.toISOString(),
      endTs?.toISOString(),
    ],
    queryFn: async (): Promise<AnalyticsKPIs | null> => {
      if (!agencyId) return null;

      const { data, error } = await supabase.rpc("analytics_kpis", {
        p_agency_id: agencyId,
        p_start_ts: startTs?.toISOString() || null,
        p_end_ts: endTs?.toISOString() || null,
        p_agent_id: agentId || null,
      });

      if (error) {
        console.error("Error fetching analytics KPIs:", error);
        throw error;
      }

      return data as unknown as AnalyticsKPIs;
    },
    enabled: enabled && !!agencyId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Helper to format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

/**
 * Format callback speed for display
 */
export function formatCallbackSpeed(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}
