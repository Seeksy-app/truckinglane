import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import {
  buildLaneRatesParams,
  fetchDatLaneRates,
  type DatLanePosting,
  type DatLaneRatesResponse,
} from "@/lib/datLaneRates";
import { cn } from "@/lib/utils";

type Load = Tables<"loads">;

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function deriveMarketAverage(data: DatLaneRatesResponse): number | null {
  const ar = data.average_rate;
  if (ar != null && Number.isFinite(ar)) return ar;
  const rows = data.postings ?? [];
  const rates = rows.map((p) => p.rate).filter((r): r is number => r != null && Number.isFinite(r));
  if (!rates.length) return null;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

function hasMarketRateData(data: DatLaneRatesResponse): boolean {
  const avg = deriveMarketAverage(data);
  const postings = data.postings ?? [];
  if (avg != null && Number.isFinite(avg)) return true;
  return postings.some((p) => p.rate != null && Number.isFinite(p.rate));
}

function competitivenessClass(our: number, marketAvg: number): string {
  if (!marketAvg || marketAvg <= 0 || !our || our <= 0) {
    return "text-muted-foreground";
  }
  const ratio = our / marketAvg;
  if (ratio >= 0.95) return "text-emerald-700 dark:text-emerald-400";
  if (ratio < 0.85) return "text-red-600 dark:text-red-400";
  return "text-amber-700 dark:text-amber-400";
}

function MarketRatesBody({
  ourRate,
  avg,
  postings,
}: {
  ourRate: number | null;
  avg: number | null;
  postings: DatLanePosting[];
}) {
  const cmpClass = competitivenessClass(ourRate ?? 0, avg ?? 0);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span>
          <span className="text-muted-foreground">Your rate: </span>
          <span className="font-semibold tabular-nums">{formatMoney(ourRate)}</span>
        </span>
        <span className="text-muted-foreground">vs</span>
        <span>
          <span className="text-muted-foreground">Market avg: </span>
          <span className="font-semibold tabular-nums">{formatMoney(avg)}</span>
        </span>
      </div>
      <p className={cn("text-xs font-medium", cmpClass)}>
        {avg && ourRate
          ? ourRate / avg >= 0.95
            ? "Competitive vs comparable DAT postings in this lane."
            : ourRate / avg < 0.85
              ? "Significantly below typical postings for this lane (verify rate units)."
              : "Close to market — confirm rate basis (total vs per-mile)."
          : "Compare your linehaul to recent DAT postings for the same equipment and lane."}

      </p>
      {postings.length > 0 && (
        <div className="rounded-md border border-border/80 bg-muted/20 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-1 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/60">
            <span>Company</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Miles</span>
            <span className="text-right">Posted</span>
          </div>
          <ul className="divide-y divide-border/50">
            {postings.map((p, i) => (
              <li
                key={`${p.company}-${i}`}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2 py-1.5 text-xs items-center"
              >
                <span className="truncate font-medium">{p.company}</span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {formatMoney(p.rate)}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {p.miles != null ? Math.round(p.miles) : "—"}
                </span>
                <span className="text-right text-muted-foreground whitespace-nowrap">{p.age_label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Only renders when lane params exist, fetch succeeds, and response contains usable rate data.
 * Hidden while loading, on error, or when data is null/unavailable.
 */
export function MarketRatesSection({ load }: { load: Load }) {
  const params = buildLaneRatesParams(load);
  const ourRate = load.rate_raw != null && Number.isFinite(Number(load.rate_raw)) ? Number(load.rate_raw) : null;

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "dat-lane-rates",
      params?.pickup_city,
      params?.pickup_state,
      params?.dest_city,
      params?.dest_state,
      params?.equipment,
    ],
    queryFn: async () => {
      if (!params) throw new Error("no lane");
      return fetchDatLaneRates(params);
    },
    enabled: !!params,
    staleTime: 30 * 60 * 1000,
  });

  if (!params) return null;
  if (isLoading) return null;
  if (isError || !data?.ok || data.unavailable) return null;
  if (!hasMarketRateData(data)) return null;

  const avg = deriveMarketAverage(data);
  const postings = data.postings ?? [];

  return (
    <div className="rounded-md border border-border/70 bg-background/50 p-2">
      <MarketRatesBody ourRate={ourRate} avg={avg} postings={postings} />
    </div>
  );
}
