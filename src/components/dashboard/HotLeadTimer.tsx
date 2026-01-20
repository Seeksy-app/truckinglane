import { useState, useEffect } from "react";
import { Clock, AlertCircle } from "lucide-react";

interface HotLeadTimerProps {
  createdAt: string;
  claimedAt?: string | null;
  compact?: boolean;
}

/**
 * Shows elapsed time since lead was created (call received).
 * If claimed, shows the final claim time instead of live ticking.
 * If lead is from a previous day, shows "Stale" and stops ticking.
 */
export function HotLeadTimer({ createdAt, claimedAt, compact = false }: HotLeadTimerProps) {
  const [elapsed, setElapsed] = useState("");
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    const checkIfStale = () => {
      const createdDate = new Date(createdAt);
      const now = new Date();
      // Check if lead is from a previous day (not today)
      return createdDate.toDateString() !== now.toDateString();
    };

    const calculateElapsed = () => {
      const start = new Date(createdAt).getTime();
      const end = claimedAt ? new Date(claimedAt).getTime() : Date.now();
      const diffMs = end - start;

      if (diffMs < 0) return "0s";

      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    };

    const stale = checkIfStale();
    setIsStale(stale);
    setElapsed(calculateElapsed());

    // Only tick if not claimed AND not stale
    if (!claimedAt && !stale) {
      const interval = setInterval(() => {
        setIsStale(checkIfStale());
        setElapsed(calculateElapsed());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [createdAt, claimedAt]);

  // Color coding based on elapsed time
  const getColorClass = () => {
    if (isStale) {
      return "text-muted-foreground"; // Stale leads from previous days
    }

    if (claimedAt) {
      // Show muted for claimed leads
      return "text-muted-foreground";
    }
    
    const start = new Date(createdAt).getTime();
    const diffMs = Date.now() - start;
    const minutes = diffMs / 1000 / 60;

    if (minutes < 2) {
      return "text-emerald-500"; // Hot - under 2 min
    } else if (minutes < 5) {
      return "text-amber-500"; // Warm - 2-5 min
    } else {
      return "text-red-500"; // Getting cold - over 5 min
    }
  };

  if (compact) {
    if (isStale) {
      return (
        <span className="text-xs font-mono text-muted-foreground">
          Stale
        </span>
      );
    }
    return (
      <span className={`text-xs font-mono ${getColorClass()}`}>
        {elapsed}
      </span>
    );
  }

  if (isStale) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Stale</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${getColorClass()}`}>
      <Clock className="h-3.5 w-3.5" />
      <span className="text-xs font-mono font-medium">{elapsed}</span>
    </div>
  );
}
