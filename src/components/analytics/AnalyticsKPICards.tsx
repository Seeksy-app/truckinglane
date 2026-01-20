import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KPICard {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  iconColor?: string;
  valueColor?: string;
  color?: "blue" | "emerald" | "amber" | "purple" | "slate" | "rose" | "red";
}

interface AnalyticsKPICardsProps {
  cards: KPICard[];
  columns?: number;
}

const colorClasses: Record<string, string> = {
  blue: "text-blue-500 bg-blue-500/10",
  emerald: "text-emerald-500 bg-emerald-500/10",
  amber: "text-amber-500 bg-amber-500/10",
  purple: "text-purple-500 bg-purple-500/10",
  slate: "text-slate-500 bg-slate-500/10",
  rose: "text-rose-500 bg-rose-500/10",
  red: "text-red-500 bg-red-500/10",
};

export const AnalyticsKPICards = ({ cards, columns }: AnalyticsKPICardsProps) => {
  // Use explicit classes for Tailwind JIT
  const gridColsClass = columns === 6 
    ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
    : columns === 5
    ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
    : "grid-cols-2 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <div className={`grid ${gridColsClass} gap-4 mb-6`}>
      {cards.map((card) => {
        const iconColorClass = card.color ? colorClasses[card.color] : (card.iconColor || "text-muted-foreground bg-muted/50");
        
        return (
          <Card
            key={card.label}
            className="bg-card border border-border hover:shadow-sm transition-shadow"
          >
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1 truncate">
                    {card.label}
                  </p>
                  <p className={`text-2xl font-bold tabular-nums ${card.valueColor || 'text-foreground'}`}>
                    {card.value}
                  </p>
                  {card.subtext && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {card.subtext}
                    </p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${iconColorClass}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
