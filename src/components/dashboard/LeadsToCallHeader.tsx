import { Phone, User, Hash, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { HotLeadTimer } from "./HotLeadTimer";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface LeadsToCallHeaderProps {
  leads: Lead[];
  onOpenAI: () => void;
}

export function LeadsToCallHeader({ leads, onOpenAI }: LeadsToCallHeaderProps) {
  const navigate = useNavigate();
  const activeLeads = leads.filter(l => l.status === "pending").slice(0, 5);
  
  if (activeLeads.length === 0) {
    return null;
  }

  const handleLeadClick = (lead: Lead) => {
    // Navigate to dashboard with lead highlighted
    navigate(`/dashboard?lead=${encodeURIComponent(lead.caller_phone)}`);
  };

  return (
    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <h3 className="text-sm font-semibold text-foreground">Leads to Call</h3>
          <span className="text-xs text-muted-foreground">({activeLeads.length} active)</span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onOpenAI}
          className="text-xs text-primary hover:text-primary/80"
        >
          Ask AI for suggestions
          <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
      
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
        {activeLeads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => handleLeadClick(lead)}
            className="flex-shrink-0 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-4 py-3 min-w-[200px] hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2 mb-2">
              {lead.is_high_intent && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-[hsl(35,92%,50%)]/20 text-[hsl(35,92%,45%)] rounded">
                  Hot
                </span>
              )}
              <HotLeadTimer createdAt={lead.created_at} claimedAt={lead.claimed_at} />
            </div>
            
            <div className="flex items-center gap-2 mb-1">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {lead.caller_name || lead.caller_company || "Unknown"}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-mono text-primary">
                {lead.caller_phone}
              </span>
            </div>
            
            {lead.load_id && (
              <div className="flex items-center gap-2 mt-1.5">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Load linked</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
