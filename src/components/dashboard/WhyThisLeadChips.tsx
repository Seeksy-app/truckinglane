import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Truck, 
  Package, 
  Phone, 
  CheckCircle2, 
  Zap, 
  Shield,
  Clock,
  User,
  Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface ReasonChip {
  label: string;
  icon: React.ElementType;
  color: string;
  priority: number;
}

interface KeywordMatch {
  keyword: string;
  scope: "agent" | "global";
  points: number;
}

// Calculate priority score and reasons from lead data
// Optional: pass matched keywords for additional scoring
export function calculatePriorityData(
  lead: Lead,
  matchedKeywords: KeywordMatch[] = []
): {
  score: number;
  reasons: ReasonChip[];
  timeInQueue: number;
} {
  const reasons: ReasonChip[] = [];
  let score = 0;

  // MC provided: +30
  if (lead.carrier_mc) {
    score += 30;
    reasons.push({
      label: "MC provided",
      icon: Truck,
      color: "bg-blue-500/10 text-blue-600 border-blue-200",
      priority: 1,
    });
  }

  // DOT provided: +20
  if (lead.carrier_usdot) {
    score += 20;
    reasons.push({
      label: "DOT provided",
      icon: Shield,
      color: "bg-purple-500/10 text-purple-600 border-purple-200",
      priority: 2,
    });
  }

  // Company name: +15
  if (lead.caller_company) {
    score += 15;
    reasons.push({
      label: "Company name",
      icon: Building2,
      color: "bg-slate-500/10 text-slate-600 border-slate-200",
      priority: 3,
    });
  }

  // Load # present: +25
  if (lead.load_id) {
    score += 25;
    reasons.push({
      label: "Load # provided",
      icon: Package,
      color: "bg-green-500/10 text-green-600 border-green-200",
      priority: 4,
    });
  }

  // Callback requested: +10
  if (lead.callback_requested_at) {
    score += 10;
    reasons.push({
      label: "Callback requested",
      icon: Phone,
      color: "bg-amber-500/10 text-amber-600 border-amber-200",
      priority: 5,
    });
  }

  // Keyword matches: Personal +15, Global +10 (max +30 total)
  let keywordBonus = 0;
  const keywordReasons: ReasonChip[] = [];
  
  for (const match of matchedKeywords) {
    const points = match.scope === "agent" ? 15 : 10;
    keywordBonus += points;
    
    if (keywordReasons.length < 2) {
      keywordReasons.push({
        label: match.scope === "agent" 
          ? `Your keyword: "${match.keyword}"`
          : `Global: "${match.keyword}"`,
        icon: match.scope === "agent" ? User : Globe,
        color: match.scope === "agent"
          ? "bg-blue-500/10 text-blue-600 border-blue-200"
          : "bg-amber-500/10 text-amber-600 border-amber-200",
        priority: match.scope === "agent" ? -1 : 0, // Personal keywords first
      });
    }
  }
  
  // Cap keyword bonus at 30
  score += Math.min(keywordBonus, 30);
  reasons.push(...keywordReasons);

  // High intent flag (fallback if no keyword matches tracked): +15
  if (lead.is_high_intent && matchedKeywords.length === 0) {
    score += 15;
    reasons.push({
      label: "High intent",
      icon: Zap,
      color: "bg-[hsl(var(--safety-orange))]/10 text-[hsl(var(--safety-orange))] border-[hsl(var(--safety-orange))]/30",
      priority: 0,
    });
  }

  // Verified carrier: +10
  if (lead.carrier_verified_at) {
    score += 10;
    reasons.push({
      label: "Verified carrier",
      icon: CheckCircle2,
      color: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
      priority: 6,
    });
  }

  // Time-based bonus: +1 per hour waiting (max +10)
  const createdAt = new Date(lead.created_at);
  const now = new Date();
  const hoursInQueue = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
  const timeBonus = Math.min(hoursInQueue, 10);
  score += timeBonus;

  // Cap at 100
  score = Math.min(score, 100);

  // Sort by priority and take top 3
  reasons.sort((a, b) => a.priority - b.priority);

  return {
    score,
    reasons: reasons.slice(0, 3),
    timeInQueue: hoursInQueue,
  };
}

// Format time in queue
export function formatTimeInQueue(hours: number): string {
  if (hours < 1) {
    return "< 1h in queue";
  }
  if (hours < 24) {
    return `${hours}h in queue`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) {
    return `${days}d in queue`;
  }
  return `${days}d ${remainingHours}h in queue`;
}

interface WhyThisLeadChipsProps {
  lead: Lead;
  showScore?: boolean;
  showTime?: boolean;
  maxChips?: number;
}

export function WhyThisLeadChips({ 
  lead, 
  showScore = true, 
  showTime = true,
  maxChips = 3 
}: WhyThisLeadChipsProps) {
  const { score, reasons, timeInQueue } = calculatePriorityData(lead);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Priority Score */}
      {showScore && (
        <Badge 
          variant="outline" 
          className={cn(
            "font-semibold tabular-nums",
            score >= 70 
              ? "bg-[hsl(var(--safety-orange))]/10 text-[hsl(var(--safety-orange))] border-[hsl(var(--safety-orange))]/30"
              : score >= 40
              ? "bg-amber-500/10 text-amber-600 border-amber-200"
              : "bg-muted text-muted-foreground"
          )}
        >
          {score}
        </Badge>
      )}

      {/* Time in queue */}
      {showTime && timeInQueue > 0 && (
        <Badge variant="outline" className="text-muted-foreground gap-1">
          <Clock className="h-3 w-3" />
          {formatTimeInQueue(timeInQueue)}
        </Badge>
      )}

      {/* Reason chips */}
      {reasons.slice(0, maxChips).map((reason, idx) => {
        const Icon = reason.icon;
        return (
          <Badge 
            key={idx} 
            variant="outline" 
            className={cn("gap-1", reason.color)}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{reason.label}</span>
          </Badge>
        );
      })}
    </div>
  );
}
