import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

function sentenceFallback(summary: string): string[] {
  const t = summary.trim();
  if (!t) return [];
  return t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

interface CallAISummaryBulletsProps {
  callId: string;
  summary: string;
  /** When false, skip network (e.g. row collapsed). */
  enabled?: boolean;
}

export function CallAISummaryBullets({
  callId,
  summary,
  enabled = true,
}: CallAISummaryBulletsProps) {
  const trimmed = summary.trim();
  const { data, isLoading } = useQuery({
    queryKey: ["summarize-call-bullets", callId, trimmed.length, trimmed.slice(0, 120)],
    queryFn: async () => {
      const { data: res, error } = await supabase.functions.invoke<{
        bullets?: string[];
        fallback?: boolean;
      }>("summarize-call-bullets", {
        body: { summary: trimmed },
      });
      if (error) throw error;
      return res;
    },
    enabled: enabled && !!trimmed,
    staleTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });

  if (!trimmed) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-2 py-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    );
  }

  const apiBullets = (data?.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  const bullets = apiBullets.length > 0 ? apiBullets : sentenceFallback(trimmed);

  if (bullets.length === 0) {
    return (
      <ul className="list-disc pl-4 space-y-1.5 text-sm text-foreground text-left">
        <li className="leading-relaxed">{trimmed}</li>
      </ul>
    );
  }

  return (
    <ul className="list-disc pl-4 space-y-1.5 text-sm text-foreground text-left marker:text-muted-foreground">
      {bullets.map((line, i) => (
        <li key={i} className="leading-relaxed pl-0.5">
          {line.replace(/^[-•*]\s*/, "")}
        </li>
      ))}
    </ul>
  );
}
