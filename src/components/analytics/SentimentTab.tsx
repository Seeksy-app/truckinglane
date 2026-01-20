import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThumbsUp, Meh, ThumbsDown, RefreshCw, MessageSquare, Users, Loader2, Info } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ElevenLabsCall {
  id: string;
  created_at: string;
  call_duration_secs: number | null;
  status: string | null;
  termination_reason: string | null;
  call_summary_title: string | null;
  transcript_summary: string | null;
  external_number: string | null;
}

interface SentimentTabProps {
  conversations: Array<{
    id: string;
    sentiment: string | null;
    outcome: string | null;
    intent: string | null;
    summary: string | null;
    phone_call_id: string;
  }>;
  calls: Array<{
    id: string;
    caller_phone: string;
    created_at: string;
  }>;
  elevenLabsCalls?: ElevenLabsCall[];
}

// KPI Card with tooltip
const SentimentKPICard = ({ 
  label, 
  value, 
  subtext, 
  icon: Icon, 
  color,
  tooltip,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  color: string;
  tooltip: string;
}) => {
  const colorClasses: Record<string, string> = {
    emerald: "text-emerald-500 bg-emerald-500/10",
    amber: "text-amber-500 bg-amber-500/10",
    rose: "text-rose-500 bg-rose-500/10",
    blue: "text-blue-500 bg-blue-500/10",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="bg-card border border-border hover:shadow-sm transition-shadow">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-muted-foreground mb-1 truncate">
                    {label}
                  </p>
                  <Info className="h-3 w-3 text-muted-foreground/50" />
                </div>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {value}
                </p>
                {subtext && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {subtext}
                  </p>
                )}
              </div>
              <div className={`p-2 rounded-lg ${colorClasses[color] || "text-muted-foreground bg-muted/50"}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
};

export const SentimentTab = ({ conversations, calls, elevenLabsCalls = [] }: SentimentTabProps) => {
  const [showMoreCalls, setShowMoreCalls] = useState(false);
  
  const stats = useMemo(() => {
    const sentiments = conversations.reduce(
      (acc, c) => {
        const s = c.sentiment?.toLowerCase() || "neutral";
        if (s.includes("positive")) acc.positive++;
        else if (s.includes("negative")) acc.negative++;
        else acc.neutral++;
        return acc;
      },
      { positive: 0, neutral: 0, negative: 0 }
    );

    // Repeat callers
    const callerCounts = calls.reduce((acc, c) => {
      acc[c.caller_phone] = (acc[c.caller_phone] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const repeatCallers = Object.values(callerCounts).filter((c) => c > 1).length;
    const repeatRate = calls.length > 0 ? Math.round((repeatCallers / Object.keys(callerCounts).length) * 100) : 0;

    // Top repeat callers (limit to 5)
    const topRepeatCallers = Object.entries(callerCounts)
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([phone, count]) => ({ phone, count }));

    // Common intents/topics (limit to 5)
    const intentCounts = conversations.reduce((acc, c) => {
      const intent = c.intent || "Unknown";
      acc[intent] = (acc[intent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const topIntents = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));

    // Recent sentiment-tagged calls
    const sentimentCalls = conversations
      .filter(c => c.sentiment)
      .slice(0, showMoreCalls ? 20 : 5);

    return {
      sentiments,
      repeatCallers,
      repeatRate,
      topRepeatCallers,
      topIntents,
      total: conversations.length,
      sentimentCalls,
    };
  }, [conversations, calls, showMoreCalls]);

  const hasData = stats.total > 0 || elevenLabsCalls.length > 0;
  const hasSentimentData = stats.sentiments.positive > 0 || stats.sentiments.neutral > 0 || stats.sentiments.negative > 0;

  const sentimentData = [
    { name: "Positive", value: stats.sentiments.positive, color: "hsl(145, 63%, 42%)" },
    { name: "Neutral", value: stats.sentiments.neutral, color: "hsl(40, 90%, 55%)" },
    { name: "Negative", value: stats.sentiments.negative, color: "hsl(0, 70%, 55%)" },
  ];

  const outcomeData = useMemo(() => {
    const outcomes: Record<string, { positive: number; neutral: number; negative: number }> = {};
    
    conversations.forEach((c) => {
      const outcome = c.outcome || "Unknown";
      if (!outcomes[outcome]) {
        outcomes[outcome] = { positive: 0, neutral: 0, negative: 0 };
      }
      const s = c.sentiment?.toLowerCase() || "neutral";
      if (s.includes("positive")) outcomes[outcome].positive++;
      else if (s.includes("negative")) outcomes[outcome].negative++;
      else outcomes[outcome].neutral++;
    });

    return Object.entries(outcomes)
      .map(([name, values]) => ({ name, ...values }))
      .slice(0, 5);
  }, [conversations]);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="h-8 w-8 text-muted-foreground mb-4 animate-spin" />
        <h3 className="text-lg font-medium text-foreground mb-2">Collecting Sentiment Data...</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Sentiment analysis requires call conversations. Data will appear here once calls are processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SentimentKPICard
          label="Positive Calls"
          value={stats.sentiments.positive}
          subtext={`${stats.total > 0 ? Math.round((stats.sentiments.positive / stats.total) * 100) : 0}% of calls`}
          icon={ThumbsUp}
          color="emerald"
          tooltip="Calls with positive caller sentiment detected by AI"
        />
        <SentimentKPICard
          label="Neutral Calls"
          value={stats.sentiments.neutral}
          subtext={`${stats.total > 0 ? Math.round((stats.sentiments.neutral / stats.total) * 100) : 0}% of calls`}
          icon={Meh}
          color="amber"
          tooltip="Calls with neutral or mixed sentiment"
        />
        <SentimentKPICard
          label="Negative Calls"
          value={stats.sentiments.negative}
          subtext={`${stats.total > 0 ? Math.round((stats.sentiments.negative / stats.total) * 100) : 0}% of calls`}
          icon={ThumbsDown}
          color="rose"
          tooltip="Calls with negative caller sentiment detected"
        />
        <SentimentKPICard
          label="Repeat Callers"
          value={stats.repeatCallers}
          subtext={`${stats.repeatRate}% return rate`}
          icon={RefreshCw}
          color="blue"
          tooltip="Unique callers who have called more than once"
        />
      </div>

      {/* Recent Sentiment Calls */}
      {hasSentimentData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Recent Sentiment-Tagged Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.sentimentCalls.length === 0 ? (
              <p className="text-muted-foreground text-sm">No sentiment data yet</p>
            ) : (
              <>
                <div className="space-y-2">
                  {stats.sentimentCalls.map((conv) => {
                    const sentimentColor = conv.sentiment?.toLowerCase().includes("positive")
                      ? "bg-emerald-500/15 text-emerald-700"
                      : conv.sentiment?.toLowerCase().includes("negative")
                      ? "bg-red-500/15 text-red-700"
                      : "bg-amber-500/15 text-amber-700";
                    
                    return (
                      <div key={conv.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 text-sm">
                        <span className="truncate max-w-[60%]">
                          {conv.summary?.slice(0, 60) || conv.intent || "No summary"}
                          {(conv.summary?.length || 0) > 60 && "..."}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${sentimentColor}`}>
                          {conv.sentiment || "Neutral"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {conversations.filter(c => c.sentiment).length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowMoreCalls(!showMoreCalls)}
                  >
                    {showMoreCalls ? "Show less" : `Show more`}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Sentiment Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasSentimentData ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                  <p className="text-sm">Collecting sentiment...</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Sentiment by Outcome Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif">Sentiment by Outcome</CardTitle>
          </CardHeader>
          <CardContent>
            {outcomeData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No outcome data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={outcomeData} layout="vertical">
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={100} />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="positive" name="Positive" stackId="a" fill="hsl(145, 63%, 42%)" />
                  <Bar dataKey="neutral" name="Neutral" stackId="a" fill="hsl(40, 90%, 55%)" />
                  <Bar dataKey="negative" name="Negative" stackId="a" fill="hsl(0, 70%, 55%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Common Call Topics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Common Call Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topIntents.length === 0 ? (
              <p className="text-muted-foreground">No intent data available</p>
            ) : (
              <div className="space-y-3">
                {stats.topIntents.map((item) => (
                  <div key={item.intent} className="flex items-center justify-between">
                    <span className="text-sm truncate max-w-[70%]">{item.intent}</span>
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                      {item.count} calls
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Repeat Callers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Users className="h-5 w-5" />
              Top Repeat Callers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topRepeatCallers.length === 0 ? (
              <p className="text-muted-foreground">No repeat callers yet</p>
            ) : (
              <div className="space-y-3">
                {stats.topRepeatCallers.map((caller) => (
                  <div key={caller.phone} className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm">{caller.phone}</p>
                    </div>
                    <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded">
                      {caller.count} calls
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
