import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  pendingCount: number;
  onDismiss: () => void;
};

export function DatPendingReminderBanner({ pendingCount, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="bg-destructive/15 border-b border-destructive/40 text-destructive tl-page-gutter py-2.5 flex items-center justify-center gap-3 relative"
    >
      <p className="text-sm font-medium text-center pr-8 sm:pr-0">
        ⚠️ {pendingCount} load{pendingCount === 1 ? "" : "s"} pending DAT upload — export now
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-destructive hover:bg-destructive/20 shrink-0"
        aria-label="Dismiss reminder"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
