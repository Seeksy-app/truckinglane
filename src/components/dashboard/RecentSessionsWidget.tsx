import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { getDateWindow } from "@/lib/dateWindows";
import type { Tables } from "@/integrations/supabase/types";

type SessionLogRow = Tables<"session_logs">;

function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

type Props = {
  agencyId: string;
};

export function RecentSessionsWidget({ agencyId }: Props) {
  const { timezone } = useUserTimezone();
  const todayWindow = getDateWindow("today", timezone);
  const todayStartIso = new Date(todayWindow.startTs).toISOString();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["session_logs_preview", agencyId, todayStartIso],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("session_logs")
        .select("*")
        .eq("agency_id", agencyId)
        .gte("created_at", todayStartIso)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (rows ?? []) as SessionLogRow[];
    },
    enabled: !!agencyId,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const rows = data ?? [];

  return (
    <Card className="mb-6 border border-[#E5E7EB] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-5 px-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#6B7280]" aria-hidden />
          <h2 className="text-base font-semibold text-[#111827] dark:text-foreground">Recent Sessions</h2>
        </div>
        <Link
          to="/admin/session-logs"
          className="text-sm font-medium text-primary hover:underline"
        >
          View All
        </Link>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Could not load sessions.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[#6B7280] dark:text-muted-foreground">No sessions logged today</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const when = new Date(row.created_at);
              const dur = formatDuration(row.duration_seconds);
              const who = row.user_display_name?.trim() || "User";
              const note = [row.action, row.note].filter(Boolean).join(" — ") || row.action;
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-1 gap-1 border-b border-[#F3F4F6] pb-3 text-sm last:border-0 last:pb-0 dark:border-border/60 sm:grid-cols-[minmax(0,7rem)_minmax(0,6rem)_1fr_auto] sm:items-center sm:gap-3"
                >
                  <span className="tabular-nums text-[#6B7280] dark:text-muted-foreground">
                    {format(when, "MMM d, h:mm a")}
                  </span>
                  <span className="font-medium text-[#111827] dark:text-foreground truncate">{who}</span>
                  <span className="text-[#374151] dark:text-foreground/90 min-w-0 break-words">{note}</span>
                  {dur ? (
                    <span className="text-xs tabular-nums text-[#6B7280] dark:text-muted-foreground sm:text-right">
                      {dur}
                    </span>
                  ) : (
                    <span className="hidden sm:block" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
