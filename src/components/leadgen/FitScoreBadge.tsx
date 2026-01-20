import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface ScoreBreakdown {
  commodity?: number;
  equipment?: number;
  fmcsa?: number;
  geography?: number;
  scale?: number;
  website?: number;
}

interface FitScoreBadgeProps {
  score: number;
  breakdown?: ScoreBreakdown;
  size?: 'sm' | 'md' | 'lg';
  showBreakdown?: boolean;
  className?: string;
}

const BREAKDOWN_LABELS: Record<keyof ScoreBreakdown, { label: string; max: number }> = {
  commodity: { label: 'Commodity Match', max: 30 },
  equipment: { label: 'Equipment Match', max: 20 },
  fmcsa: { label: 'FMCSA Enriched', max: 20 },
  geography: { label: 'US Geography', max: 10 },
  scale: { label: 'Business Scale', max: 10 },
  website: { label: 'Website Quality', max: 10 },
};

export function FitScoreBadge({ 
  score, 
  breakdown, 
  size = 'md', 
  showBreakdown = false,
  className 
}: FitScoreBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (score >= 50) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    return 'bg-muted text-muted-foreground border-border';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'High Fit';
    if (score >= 50) return 'Medium Fit';
    return 'Low Fit';
  };

  const sizeClasses = {
    sm: 'text-sm px-2 py-0.5',
    md: 'text-base px-3 py-1',
    lg: 'text-2xl px-4 py-2 font-bold',
  };

  const hasBreakdown = breakdown && Object.keys(breakdown).length > 0;

  if (!showBreakdown || !hasBreakdown) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(getScoreColor(score), sizeClasses[size], 'cursor-help', className)}
            >
              {score}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{getScoreLabel(score)}</p>
            <p className="text-xs text-muted-foreground">Fit Score: {score}/100</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger className="w-full">
        <div 
          className={cn(
            'flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/50',
            getScoreColor(score)
          )}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">{score}</span>
            <div className="text-left">
              <div className="font-medium">{getScoreLabel(score)}</div>
              <div className="text-xs opacity-70">Fit Score</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 opacity-50" />
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-2">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-muted-foreground mb-2">Why this score?</div>
          {Object.entries(BREAKDOWN_LABELS).map(([key, { label, max }]) => {
            const value = breakdown[key as keyof ScoreBreakdown] || 0;
            const percentage = (value / max) * 100;
            
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <span className={cn(
                    'font-mono',
                    value > 0 ? 'text-green-500' : 'text-muted-foreground'
                  )}>
                    +{value}/{max}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      'h-full rounded-full transition-all',
                      value > 0 ? 'bg-green-500' : 'bg-transparent'
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className="pt-2 border-t mt-3">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total Score</span>
              <span className={cn(
                'font-mono',
                score >= 80 ? 'text-green-500' : score >= 50 ? 'text-yellow-500' : 'text-muted-foreground'
              )}>
                {score}/100
              </span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Inline score display for tables/lists
export function FitScoreInline({ score, className }: { score: number; className?: string }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('font-bold cursor-help', getScoreColor(score), className)}>
            {score}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {score >= 80 ? 'High Fit' : score >= 50 ? 'Medium Fit' : 'Low Fit'} ({score}/100)
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
