import { Card, CardContent } from "@/components/ui/card";
import { Package, UserCheck, Users, Phone, CheckCircle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { getTimezoneLabel } from "@/lib/dateWindows";

export type DashboardMode = "open" | "claimed" | "pending" | "calls" | "booked";

interface DashboardStatsProps {
  stats: {
    openToday: number;
    claimedToday: number;
    pendingToday: number;
    aiCallsToday: number;
    bookedToday: number;
  };
  activeMode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
}

export const DashboardStats = ({ stats, activeMode, onModeChange }: DashboardStatsProps) => {
  const { timezone } = useUserTimezone();
  const timezoneLabel = getTimezoneLabel(timezone);

  const statCards: {
    key: DashboardMode;
    label: string;
    value: number;
    icon: typeof Package;
    activeClass: string;
    inactiveClass: string;
    tooltip: { scope: string; range: string; description: string };
  }[] = [
    {
      key: "open",
      label: "Open",
      value: stats.openToday,
      icon: Package,
      activeClass: "bg-[hsl(25,95%,53%)] border-[hsl(25,95%,45%)] text-white",
      inactiveClass: "bg-card border-border hover:border-[hsl(25,95%,53%)]/50 hover:bg-[hsl(25,95%,53%)]/5",
      tooltip: { scope: "Agency", range: "All active", description: "Active loads available for booking" },
    },
    {
      key: "claimed",
      label: "Claimed",
      value: stats.claimedToday,
      icon: UserCheck,
      activeClass: "bg-[hsl(210,80%,50%)] border-[hsl(210,80%,42%)] text-white",
      inactiveClass: "bg-card border-border hover:border-[hsl(210,80%,50%)]/50 hover:bg-[hsl(210,80%,50%)]/5",
      tooltip: { scope: "Agency", range: "All active", description: "Loads and leads currently claimed by agents" },
    },
    {
      key: "pending",
      label: "Leads",
      value: stats.pendingToday,
      icon: Users,
      activeClass: "bg-[hsl(38,92%,50%)] border-[hsl(38,92%,42%)] text-[hsl(220,15%,15%)]",
      inactiveClass: "bg-card border-border hover:border-[hsl(38,92%,50%)]/50 hover:bg-[hsl(38,92%,50%)]/5",
      tooltip: { scope: "Agency", range: "Pending only", description: "Unclaimed leads waiting for follow-up" },
    },
    {
      key: "calls",
      label: "AI Calls",
      value: stats.aiCallsToday,
      icon: Phone,
      activeClass: "bg-[hsl(220,15%,20%)] border-[hsl(220,15%,15%)] text-white",
      inactiveClass: "bg-card border-border hover:border-[hsl(220,15%,20%)]/50 hover:bg-[hsl(220,15%,20%)]/5",
      tooltip: { scope: "Agent", range: "Today (resets at midnight)", description: "AI-handled calls today. Resets daily at midnight." },
    },
    {
      key: "booked",
      label: "Booked",
      value: stats.bookedToday,
      icon: CheckCircle,
      activeClass: "bg-[hsl(145,63%,42%)] border-[hsl(145,63%,35%)] text-white",
      inactiveClass: "bg-card border-border hover:border-[hsl(145,63%,42%)]/50 hover:bg-[hsl(145,63%,42%)]/5",
      tooltip: { scope: "Agent", range: "Today (resets at midnight)", description: "Loads booked today. Resets daily at midnight." },
    },
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {statCards.map((stat) => {
          const isActive = activeMode === stat.key;
          const Icon = stat.icon;
          return (
            <Tooltip key={stat.key} delayDuration={300}>
              <TooltipTrigger asChild>
                <Card 
                  className={`cursor-pointer transition-all duration-200 border-2 ${
                    isActive ? stat.activeClass : stat.inactiveClass
                  }`}
                  onClick={() => onModeChange(stat.key)}
                >
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-2xl font-bold tabular-nums ${isActive ? "" : "text-foreground"}`}>
                          {stat.value}
                        </p>
                        <p className={`text-xs font-medium uppercase tracking-wide mt-0.5 ${
                          isActive ? "opacity-90" : "text-muted-foreground"
                        }`}>
                          {stat.label}
                        </p>
                      </div>
                      <div className={`p-2 rounded-lg ${isActive ? "bg-white/20" : "bg-muted"}`}>
                        <Icon className={`h-5 w-5 ${isActive ? "" : "text-muted-foreground"}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-xs">
                <div className="space-y-1">
                  <p className="font-medium">{stat.tooltip.description}</p>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Info className="h-3 w-3" />
                    <span>Scope: {stat.tooltip.scope} • {stat.tooltip.range} • TZ: {timezoneLabel}</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};
