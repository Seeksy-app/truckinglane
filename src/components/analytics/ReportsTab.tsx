import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Phone, Users, CheckCircle2, Clock, TrendingUp, FileText } from "lucide-react";
import { useCanonicalMetrics, formatDuration } from "@/hooks/useCanonicalMetrics";
import { getDateWindow, type DateRangeType } from "@/lib/dateWindows";
import { useUserTimezone } from "@/hooks/useUserTimezone";

interface ReportsTabProps {
  agencyId: string | null;
  dateRange?: DateRangeType;
}

/**
 * ReportsTab now uses the canonical metrics RPC.
 * Date controls are inherited from the parent Analytics page header.
 * There should be NO duplicate date selectors here.
 */
export function ReportsTab({ agencyId, dateRange = "7d" }: ReportsTabProps) {
  const { timezone } = useUserTimezone();

  // Use the same date window logic as Analytics page
  const dateWindow = useMemo(() => {
    return getDateWindow(dateRange, timezone);
  }, [dateRange, timezone]);

  const dateFilter = useMemo(() => {
    return {
      start: dateWindow.startTs ? new Date(dateWindow.startTs) : null,
      end: dateWindow.endTs ? new Date(dateWindow.endTs) : null,
    };
  }, [dateWindow]);

  // Use canonical metrics hook - single source of truth
  const { data: metrics, isLoading } = useCanonicalMetrics({
    agencyId,
    startTs: dateFilter.start,
    endTs: dateFilter.end,
  });

  const dateLabel = useMemo(() => {
    switch (dateRange) {
      case "today":
        return "Today";
      case "7d":
        return "Last 7 Days";
      case "30d":
        return "Last 30 Days";
      case "all":
        return "All Time";
      default:
        return "Selected Period";
    }
  }, [dateRange]);

  // Generate summary text from canonical metrics
  const summaryText = useMemo(() => {
    if (!metrics) return "";

    const claimRateDesc =
      metrics.claim_rate > 50
        ? "strong"
        : metrics.claim_rate > 25
        ? "moderate"
        : "needs improvement";
    const bookRateDesc =
      metrics.book_rate > 30
        ? "excellent"
        : metrics.book_rate > 15
        ? "good"
        : "below target";
    const avgClaimTime =
      metrics.avg_claim_seconds > 0
        ? formatDuration(metrics.avg_claim_seconds)
        : "not available";

    return (
      `Your agency handled ${metrics.ai_calls} AI calls during ${dateLabel.toLowerCase()}, generating ${metrics.leads_created} new leads. ` +
      `Of those, ${metrics.leads_claimed} were claimed by agents (${metrics.claim_rate}% claim rate - ${claimRateDesc}). ` +
      `${metrics.leads_booked} leads converted to bookings, achieving a ${metrics.book_rate}% book rate (${bookRateDesc}). ` +
      `Average time from lead creation to claim was ${avgClaimTime}. ` +
      `${metrics.leads_closed} leads were closed without booking, resulting in a ${metrics.close_rate}% close rate.`
    );
  }, [metrics, dateLabel]);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      {metrics && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Report Summary — {dateLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{summaryText}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : metrics ? (
        <div className="space-y-6">
          {/* Primary Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Calls</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.ai_calls}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.total_minutes} min total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leads Created</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.leads_created}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.leads_pending} pending
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leads Claimed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.leads_claimed}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.claim_rate}% claim rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leads Booked</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.leads_booked}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.book_rate}% book rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Secondary Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Time to Claim</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatDuration(metrics.avg_claim_seconds)}
                </div>
                <p className="text-xs text-muted-foreground">From lead creation to claim</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Engaged Calls</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.engaged_calls}</div>
                <p className="text-xs text-muted-foreground">≥20s or high intent</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Intent</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.high_intent}</div>
                <p className="text-xs text-muted-foreground">Calls/leads with high intent</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.conversion_rate}%</div>
                <p className="text-xs text-muted-foreground">Calls → Bookings</p>
              </CardContent>
            </Card>
          </div>

          {/* Summary Table Card */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Breakdown</CardTitle>
              <CardDescription>Performance metrics for {dateLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Total AI Calls</span>
                  <span className="font-medium">{metrics.ai_calls}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Engaged Calls (≥20s)</span>
                  <span className="font-medium">{metrics.engaged_calls}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Quick Hangups (&lt;10s)</span>
                  <span className="font-medium">{metrics.quick_hangups}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">High Intent</span>
                  <span className="font-medium">{metrics.high_intent}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Leads Created</span>
                  <span className="font-medium">{metrics.leads_created}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Leads Claimed</span>
                  <span className="font-medium">{metrics.leads_claimed}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Leads Booked</span>
                  <span className="font-medium">{metrics.leads_booked}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Leads Closed</span>
                  <span className="font-medium">{metrics.leads_closed}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Avg. Time to Claim</span>
                  <span className="font-medium">{formatDuration(metrics.avg_claim_seconds)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No data available for this period.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
