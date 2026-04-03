import { Badge } from "@/components/ui/badge";
import { Tables } from "@/integrations/supabase/types";
import {
  truckerToolsDollarDisplay,
  truckerToolsRateFieldDisplay,
} from "@/lib/truckerToolsLoads";

type Load = Tables<"loads">;

// Format rate display
export function formatRateDisplay(load: Load): string | null {
  const tt = truckerToolsRateFieldDisplay(
    load.template_type,
    load.rate_raw,
    !!load.is_per_ton,
  );
  if (tt !== undefined) return tt;
  if (load.rate_raw == null || Number(load.rate_raw) <= 0) return null;
  if (load.is_per_ton) {
    return `$${Number(load.rate_raw).toLocaleString()}/ton`;
  }
  return `$${Number(load.rate_raw).toLocaleString()}`;
}

// Format currency with TBD handling for per-ton
export function formatCurrency(load: Load, value: number | null): string | null {
  if (load.is_per_ton && (!load.weight_lbs || load.customer_invoice_total === 0)) {
    return "TBD";
  }
  const tt = truckerToolsDollarDisplay(load, value);
  if (tt !== undefined) return tt;
  if (!value && value !== 0) return null;
  return `$${value.toLocaleString()}`;
}

// Format location string
const formatLocation = (city?: string | null, state?: string | null, zip?: string | null): string | null => {
  const parts = [city, state, zip].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
};

/** City + state only (expanded row route cards). */
export function formatCityState(city?: string | null, state?: string | null): string | null {
  const c = city?.trim();
  const s = state?.trim();
  if (c && s) return `${c}, ${s.toUpperCase()}`;
  if (s) return s.toUpperCase();
  if (c) return c;
  return null;
}

// Clean copy format - omits null/empty fields
export function formatLoadNotes(load: Load): string {
  const lines: string[] = [];
  
  // Title line
  const statusLabel = load.status.charAt(0).toUpperCase() + load.status.slice(1);
  lines.push(`Load #${load.load_number} • ${load.template_type} • ${statusLabel}`);
  lines.push("");
  
  // Route section
  if (load.ship_date) lines.push(`Ship: ${load.ship_date}`);
  const pickup = formatLocation(load.pickup_city, load.pickup_state, load.pickup_zip);
  if (pickup) lines.push(`Pickup: ${pickup}`);
  const delivery = formatLocation(load.dest_city, load.dest_state, load.dest_zip);
  if (delivery) lines.push(`Delivery: ${delivery}`);
  if (load.miles) lines.push(`Miles: ${load.miles}`);
  
  // Equipment section
  const trailerParts: string[] = [];
  if (load.trailer_type) trailerParts.push(load.trailer_type);
  if (load.trailer_footage) trailerParts.push(`${load.trailer_footage}ft`);
  if (load.tarps) {
    const tarpStr = load.tarp_size ? `Tarps: ${load.tarps} (${load.tarp_size})` : `Tarps: ${load.tarps}`;
    trailerParts.push(tarpStr);
  }
  if (trailerParts.length > 0) lines.push(`Trailer: ${trailerParts.join(" • ")}`);
  if (load.commodity) lines.push(`Commodity: ${load.commodity}`);
  if (load.weight_lbs) lines.push(`Weight: ${load.weight_lbs.toLocaleString()} lbs`);
  if (load.dispatch_status) lines.push(`Dispatch: ${load.dispatch_status}`);
  
  // Financials section
  lines.push("");
  const rate = formatRateDisplay(load);
  const invoice = formatCurrency(load, load.customer_invoice_total);
  if (rate && invoice) {
    lines.push(`Rate: ${rate} • Invoice: ${invoice}`);
  } else if (rate) {
    lines.push(`Rate: ${rate}`);
  } else if (invoice) {
    lines.push(`Invoice: ${invoice}`);
  }

  const targetPay = formatCurrency(load, load.target_pay);
  const targetComm = formatCurrency(load, load.target_commission);
  if (targetPay && targetComm) {
    lines.push(`Target Pay: ${targetPay} • Target Comm: ${targetComm}`);
  }

  const maxPay = formatCurrency(load, load.max_pay);
  const maxComm = formatCurrency(load, load.max_commission);
  if (maxPay && maxComm) {
    lines.push(`Max Pay: ${maxPay} • Max Comm: ${maxComm}`);
  }
  
  return lines.filter(l => l !== "").join("\n");
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : value;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-bold text-foreground leading-tight">
        {display}
      </div>
    </div>
  );
}

/** Omits the entire row when value is empty (equipment optional fields). */
function OptionalDetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-bold text-foreground leading-tight">{value}</div>
    </div>
  );
}

const dispatchBadgeClass =
  "w-fit text-[10px] h-5 px-1.5 font-semibold border bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,40%)] border-[hsl(25,95%,53%)]/30 hover:bg-[hsl(25,95%,53%)]/15 shadow-none";

interface LoadDetailsGridProps {
  load: Load;
}

// Get commodity display value - infer for Adelphia loads if not set
export function getCommodityDisplay(load: Load): string | null {
  // If commodity is already set, use it
  if (load.commodity) return load.commodity;
  
  // For Adelphia loads, infer from trailer_footage
  // If length has value -> rebar, if blank -> COILS
  if (load.load_number?.startsWith("ADE-")) {
    return load.trailer_footage ? "rebar" : "COILS";
  }
  
  return null;
}

export function LoadDetailsGrid({ load }: LoadDetailsGridProps) {
  const pickup = formatCityState(load.pickup_city, load.pickup_state);
  const delivery = formatCityState(load.dest_city, load.dest_state);
  const rate = formatRateDisplay(load);
  const invoice = formatCurrency(load, load.customer_invoice_total);
  const targetPay = formatCurrency(load, load.target_pay);
  const targetComm = formatCurrency(load, load.target_commission);
  const maxPay = formatCurrency(load, load.max_pay);
  const maxComm = formatCurrency(load, load.max_commission);

  const tarpsDisplay = load.tarps
    ? load.tarp_size
      ? `${load.tarps} (${load.tarp_size})`
      : String(load.tarps)
    : null;
  const trailerTypeLine = [load.trailer_type, tarpsDisplay].filter(Boolean).join(" · ") || null;

  const commodityDisplay = getCommodityDisplay(load);
  const footageLine =
    load.trailer_footage != null ? `${load.trailer_footage} ft` : null;
  const weightLine =
    load.weight_lbs != null ? `${load.weight_lbs.toLocaleString()} lbs` : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
      {/* Route */}
      <div className="flex flex-col gap-4 min-w-0">
        <DetailField label="Ship Date" value={load.ship_date} />
        <DetailField label="Pickup" value={pickup} />
        <DetailField label="Delivery" value={delivery} />
      </div>

      {/* Equipment */}
      <div className="flex flex-col gap-4 min-w-0">
        <DetailField label="Trailer Type" value={trailerTypeLine} />
        <OptionalDetailField label="Footage" value={footageLine} />
        <OptionalDetailField label="Weight" value={weightLine} />
        <OptionalDetailField label="Commodity" value={commodityDisplay} />
      </div>

      {/* Financials */}
      <div className="flex flex-col gap-4 min-w-0">
        <DetailField
          label={load.is_per_ton ? "Rate ($/ton)" : "Rate"}
          value={rate}
        />
        <DetailField label="Invoice" value={invoice} />
        <DetailField label="Target Pay" value={targetPay} />
        <DetailField label="Max Pay" value={maxPay} />
      </div>

      {/* Commission */}
      <div className="flex flex-col gap-4 min-w-0">
        <DetailField label="Target Comm" value={targetComm} />
        <DetailField label="Max Comm" value={maxComm} />
        {load.dispatch_status?.trim() ? (
          <div className="flex flex-col gap-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dispatch
            </div>
            <Badge variant="outline" className={dispatchBadgeClass}>
              {load.dispatch_status}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
}
