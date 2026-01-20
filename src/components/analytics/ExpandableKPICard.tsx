import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronUp, Info, ExternalLink, Clock, Phone, Flame } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface ItemBase {
  id: string;
  created_at: string;
}

interface LeadItem extends ItemBase {
  type: "lead";
  caller_phone: string;
  caller_company?: string | null;
  status: string;
  is_high_intent?: boolean | null;
  intent_score?: number | null;
}

interface CallItem extends ItemBase {
  type: "call";
  external_number?: string | null;
  call_duration_secs?: number | null;
  call_summary_title?: string | null;
  status?: string | null;
  is_high_intent?: boolean | null;
}

export type ExpandableItem = LeadItem | CallItem;

interface ExpandableKPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  subtextExplainer?: string;
  icon: React.ElementType;
  color: "blue" | "emerald" | "amber" | "purple" | "slate" | "rose";
  tooltip: string;
  items?: ExpandableItem[];
  onItemClick?: (item: ExpandableItem) => void;
  emptyMessage?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const colorClasses: Record<string, string> = {
  blue: "text-blue-500 bg-blue-500/10",
  emerald: "text-emerald-500 bg-emerald-500/10",
  amber: "text-amber-500 bg-amber-500/10",
  purple: "text-purple-500 bg-purple-500/10",
  slate: "text-slate-500 bg-slate-500/10",
  rose: "text-rose-500 bg-rose-500/10",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  claimed: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  booked: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  closed: "bg-slate-500/20 text-slate-700 dark:text-slate-400",
};

export const ExpandableKPICard = ({
  label,
  value,
  subtext,
  subtextExplainer,
  icon: Icon,
  color,
  tooltip,
  items = [],
  onItemClick,
  emptyMessage = "No items to display",
  isExpanded,
  onToggle,
}: ExpandableKPICardProps) => {
  const hasItems = items.length > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card
          className={cn(
            "bg-card border border-border transition-all",
            hasItems && "cursor-pointer hover:shadow-md hover:border-primary/30",
            isExpanded && "ring-2 ring-primary/30"
          )}
          onClick={() => hasItems && onToggle?.()}
        >
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground mt-1 cursor-help">
                        {subtext}
                      </p>
                    </TooltipTrigger>
                    {subtextExplainer && (
                      <TooltipContent side="bottom" className="max-w-xs">
                        {subtextExplainer}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </div>
              <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            {hasItems && (
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                <span>{isExpanded ? "Collapse" : "View items"}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
};

// Expanded list panel - rendered separately for full-width display
interface ExpandedListPanelProps {
  label: string;
  items: ExpandableItem[];
  onItemClick?: (item: ExpandableItem) => void;
  emptyMessage?: string;
  onClose: () => void;
}

export const ExpandedListPanel = ({
  label,
  items,
  onItemClick,
  emptyMessage = "No items to display",
  onClose,
}: ExpandedListPanelProps) => {
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? items : items.slice(0, 10);
  const hasMore = items.length > 10;

  const renderItem = (item: ExpandableItem) => {
    if (item.type === "lead") {
      return (
        <div
          key={item.id}
          onClick={() => onItemClick?.(item)}
          className={cn(
            "flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/50 text-sm",
            onItemClick && "cursor-pointer hover:bg-muted transition-colors"
          )}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
              <Clock className="h-3 w-3" />
              <span className="text-xs">
                {format(parseISO(item.created_at), "MMM d, h:mm a")}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-mono text-xs truncate">
                {item.caller_phone}
              </span>
              {item.caller_company && (
                <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                  ({item.caller_company})
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {item.is_high_intent && (
              <Flame className="h-3 w-3 text-amber-500" />
            )}
            <Badge variant="secondary" className={cn("text-xs", statusColors[item.status])}>
              {item.status}
            </Badge>
            {onItemClick && (
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
      );
    }

    // Call item
    return (
      <div
        key={item.id}
        onClick={() => onItemClick?.(item)}
        className={cn(
          "flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/50 text-sm",
          onItemClick && "cursor-pointer hover:bg-muted transition-colors"
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
            <Clock className="h-3 w-3" />
            <span className="text-xs">
              {format(parseISO(item.created_at), "MMM d, h:mm a")}
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-mono text-xs truncate">
              {item.external_number || "—"}
            </span>
          </div>
          {item.call_summary_title && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline max-w-[300px]">
              {item.call_summary_title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {item.is_high_intent && (
            <Flame className="h-3 w-3 text-amber-500" />
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {item.call_duration_secs ? `${item.call_duration_secs}s` : "—"}
          </span>
          {onItemClick && (
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="animate-in slide-in-from-top-2 duration-200 col-span-full">
      <CardContent className="py-4 px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">{label}</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
          >
            <ChevronUp className="h-3 w-3 mr-1" />
            Collapse
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-4">
            {emptyMessage}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {displayItems.map(renderItem)}
            </div>
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll(!showAll);
                }}
              >
                {showAll ? "Show less" : `Show ${items.length - 10} more`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
