import { Badge } from "@/components/ui/badge";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";

interface CarrierBadgeProps {
  notes: string | null | undefined;
  compact?: boolean;
}

// Parse carrier status from lead notes
// Notes format: "[CARRIER STATUS]\n✅ Carrier (DOT xxx) - VERIFIED..." or "⚠️ Carrier (DOT xxx) - Authority: INACTIVE..."
const parseCarrierStatus = (notes: string | null | undefined): {
  status: 'verified' | 'warning' | 'pending' | null;
  label: string;
  details: string;
} => {
  if (!notes) return { status: null, label: '', details: '' };
  
  // Check for carrier status section
  if (!notes.includes('[CARRIER STATUS]')) {
    return { status: null, label: '', details: '' };
  }

  if (notes.includes('✅') && notes.includes('VERIFIED')) {
    return {
      status: 'verified',
      label: 'Verified',
      details: 'Active authority & insured',
    };
  }
  
  if (notes.includes('⚠️')) {
    // Extract the issue from the notes
    const match = notes.match(/⚠️[^-]*-\s*(.+?)(?:\n|$)/);
    const issue = match?.[1] || 'Status issue detected';
    return {
      status: 'warning',
      label: 'Warning',
      details: issue.trim(),
    };
  }
  
  if (notes.includes('📋') && notes.includes('pending')) {
    return {
      status: 'pending',
      label: 'Pending',
      details: 'Carrier lookup in progress',
    };
  }
  
  return { status: null, label: '', details: '' };
};

export const CarrierBadge = ({ notes, compact = false }: CarrierBadgeProps) => {
  const carrier = parseCarrierStatus(notes);
  
  if (!carrier.status) return null;

  const badgeContent = (
    <>
      {carrier.status === 'verified' && (
        <Badge 
          className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1"
          variant="outline"
        >
          <CheckCircle2 className="h-3 w-3" />
          {!compact && <span>Verified</span>}
        </Badge>
      )}
      {carrier.status === 'warning' && (
        <Badge 
          className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1"
          variant="outline"
        >
          <AlertTriangle className="h-3 w-3" />
          {!compact && <span>Warning</span>}
        </Badge>
      )}
      {carrier.status === 'pending' && (
        <Badge 
          className="bg-muted text-muted-foreground border-border gap-1"
          variant="outline"
        >
          <HelpCircle className="h-3 w-3" />
          {!compact && <span>Pending</span>}
        </Badge>
      )}
    </>
  );

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="cursor-help">{badgeContent}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium">{carrier.label}</p>
          <p className="text-xs text-muted-foreground">{carrier.details}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
