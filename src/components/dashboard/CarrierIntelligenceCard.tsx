import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Shield, Phone, TrendingUp, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CarrierIntelligence {
  usdot: string;
  mc?: string;
  carrier_name: string;
  fmcsa_data: {
    authority_status: string;
    insurance_status: string;
    safety_rating: string;
    power_units: number;
    drivers: number;
    out_of_service?: boolean;
  };
  ai_activity: {
    total_calls: number;
    completed_calls: number;
    callback_requested: number;
    declined: number;
    avg_call_duration_secs: number;
    sentiment_breakdown: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  ai_insights: {
    conversion_likelihood: number;
    risk_score: number;
    recommended_action: string | null;
  };
  verified_badge?: {
    status: 'verified' | 'warning' | 'danger';
    message: string;
  };
  last_call_outcome: string | null;
  last_call_at: string | null;
}

interface CarrierIntelligenceCardProps {
  carrier: CarrierIntelligence;
}

const ACTIONS: Record<string, { label: string; color: string }> = {
  ok_to_book: { label: "Ready to Book", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  proceed_with_caution: { label: "Proceed with Caution", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  do_not_book: { label: "Insurance status unclear — verify before booking", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  verify_before_booking: { label: "Insurance status unclear — verify before booking", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  follow_up_with_rate_adjustment: { label: "Follow up with Rate", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  follow_up_in_2_hours: { label: "Follow up in 2h", color: "bg-primary/20 text-primary border-primary/30" },
};

const OUTCOMES: Record<string, string> = {
  callback_requested: "Callback Requested",
  completed: "Completed",
  declined: "Declined",
  voicemail: "Left Voicemail",
  no_answer: "No Answer",
};

export function CarrierIntelligenceCard({ carrier }: CarrierIntelligenceCardProps) {
  // PRIMARY BADGE LOGIC: USDOT Status + Out of Service only
  const getBadge = () => {
    if (carrier.verified_badge) return carrier.verified_badge;
    
    if (carrier.fmcsa_data.out_of_service) {
      return { status: 'danger' as const, message: 'OUT OF SERVICE' };
    }
    if (carrier.fmcsa_data.authority_status === "ACTIVE") {
      return { status: 'verified' as const, message: 'Active' };
    }
    return { status: 'danger' as const, message: 'Inactive' };
  };
  
  const badge = getBadge();

  const badgeStyles = {
    verified: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    danger: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const action = carrier.ai_insights.recommended_action 
    ? ACTIONS[carrier.ai_insights.recommended_action] || { label: carrier.ai_insights.recommended_action, color: "bg-muted text-muted-foreground" }
    : null;

  const lastOutcome = carrier.last_call_outcome 
    ? OUTCOMES[carrier.last_call_outcome] || carrier.last_call_outcome 
    : null;

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur hover:border-primary/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{carrier.carrier_name}</h3>
              <p className="text-xs text-muted-foreground font-mono">
                DOT {carrier.usdot}{carrier.mc ? ` • MC ${carrier.mc}` : ''}
              </p>
            </div>
          </div>
          
          <Badge className={`${badgeStyles[badge.status]} shrink-0 text-xs`}>
            <Shield className="h-3 w-3 mr-1" />
            {badge.message}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          {/* Last Call Outcome */}
          <div className="bg-background/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Call</span>
            </div>
            <p className="text-xs font-medium text-foreground truncate">
              {lastOutcome || "No calls yet"}
            </p>
            {carrier.last_call_at && (
              <p className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(carrier.last_call_at), { addSuffix: true })}
              </p>
            )}
          </div>

          {/* Conversion Likelihood */}
          <div className="bg-background/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Conversion</span>
            </div>
            <p className={`text-sm font-bold ${
              carrier.ai_insights.conversion_likelihood >= 0.6 ? "text-emerald-400" :
              carrier.ai_insights.conversion_likelihood >= 0.3 ? "text-amber-400" :
              "text-muted-foreground"
            }`}>
              {(carrier.ai_insights.conversion_likelihood * 100).toFixed(0)}%
            </p>
          </div>

          {/* Total AI Calls */}
          <div className="bg-background/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">AI Calls</span>
            </div>
            <p className="text-sm font-bold text-foreground">
              {carrier.ai_activity.total_calls}
            </p>
          </div>
        </div>

        {/* Recommended Action */}
        {action && (
          <div className={`px-3 py-2 rounded-md border text-xs font-medium ${action.color}`}>
            {action.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
