import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type LoadLaneFiltersPopoverProps = {
  pickupState: string;
  destState: string;
  onPickupChange: (v: string) => void;
  onDestChange: (v: string) => void;
  pickupStates: string[];
  destStates: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Match large search row (h-12). */
  size?: "default" | "large";
};

export function LoadLaneFiltersPopover({
  pickupState,
  destState,
  onPickupChange,
  onDestChange,
  pickupStates,
  destStates,
  open,
  onOpenChange,
  size = "default",
}: LoadLaneFiltersPopoverProps) {
  const laneActive = pickupState !== "all" || destState !== "all";
  const large = size === "large";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "shrink-0 gap-2 border-[#E5E7EB] bg-white text-[#374151] shadow-sm",
            large ? "h-12 rounded-xl px-4 text-sm font-medium" : "h-9",
            laneActive && "border-[#F97316]/50",
          )}
        >
          <Filter className={cn("text-[#6B7280]", large ? "h-5 w-5" : "h-4 w-4")} />
          Filters
          {laneActive && <span className="h-2 w-2 rounded-full bg-[#F97316]" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4" align="end">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pickup state</p>
          <Select value={pickupState} onValueChange={onPickupChange}>
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent className="bg-popover max-h-[280px]">
              <SelectItem value="all">All states</SelectItem>
              {pickupStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery state</p>
          <Select value={destState} onValueChange={onDestChange}>
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent className="bg-popover max-h-[280px]">
              <SelectItem value="all">All states</SelectItem>
              {destStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              onPickupChange("all");
              onDestChange("all");
            }}
          >
            Reset lane filters
          </Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
