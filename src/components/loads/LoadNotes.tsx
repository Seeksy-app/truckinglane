import { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

// Format rate display
const formatRateDisplay = (load: Load): string | null => {
  if (!load.rate_raw) return null;
  if (load.is_per_ton) {
    return `$${load.rate_raw?.toLocaleString()} / ton`;
  }
  return `$${load.rate_raw?.toLocaleString()}`;
};

// Format currency with TBD handling for per-ton
const formatCurrency = (load: Load, value: number | null): string | null => {
  if (load.is_per_ton && (!load.weight_lbs || load.customer_invoice_total === 0)) {
    return "TBD";
  }
  if (!value && value !== 0) return null;
  return `$${value.toLocaleString()}`;
};

// Format location string
const formatLocation = (city?: string | null, state?: string | null, zip?: string | null): string | null => {
  const parts = [city, state, zip].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
};

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

// Field component for compact display
interface FieldProps {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}

function Field({ label, value, className = "" }: FieldProps) {
  if (!value && value !== 0) return null;
  return (
    <div className={className}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium leading-tight">{value}</p>
    </div>
  );
}

// Section header component
function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
      {title}
    </h4>
  );
}

interface LoadDetailsGridProps {
  load: Load;
}

// Get commodity display value - infer for Adelphia loads if not set
function getCommodityDisplay(load: Load): string | null {
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
  const pickup = formatLocation(load.pickup_city, load.pickup_state, load.pickup_zip);
  const delivery = formatLocation(load.dest_city, load.dest_state, load.dest_zip);
  const rate = formatRateDisplay(load);
  const invoice = formatCurrency(load, load.customer_invoice_total);
  const targetPay = formatCurrency(load, load.target_pay);
  const targetComm = formatCurrency(load, load.target_commission);
  const maxPay = formatCurrency(load, load.max_pay);
  const maxComm = formatCurrency(load, load.max_commission);
  
  // Combine tarps info
  const tarpsDisplay = load.tarps 
    ? (load.tarp_size ? `${load.tarps} (${load.tarp_size})` : load.tarps)
    : null;

  // Get commodity (with inference for Adelphia)
  const commodityDisplay = getCommodityDisplay(load);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Route Section */}
      <div className="space-y-2">
        <SectionHeader title="Route" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Field label="Ship Date" value={load.ship_date} />
          <Field label="Miles" value={load.miles} />
          <Field label="Pickup" value={pickup} className="col-span-2" />
          <Field label="Delivery" value={delivery} className="col-span-2" />
        </div>
      </div>

      {/* Equipment Section */}
      <div className="space-y-2">
        <SectionHeader title="Equipment" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Field label="Trailer Type" value={load.trailer_type} />
          <Field label="Footage" value={load.trailer_footage ? `${load.trailer_footage} ft` : null} />
          <Field label="Tarps" value={tarpsDisplay} />
          <Field label="Weight" value={load.weight_lbs ? `${load.weight_lbs.toLocaleString()} lbs` : null} />
          <Field label="Commodity" value={commodityDisplay} className="col-span-2" />
          {load.dispatch_status && (
            <Field label="Dispatch" value={load.dispatch_status} className="col-span-2" />
          )}
        </div>
      </div>

      {/* Financials Section */}
      <div className="space-y-2">
        <SectionHeader title="Financials" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Field label="Rate" value={rate} />
          <Field label="Invoice" value={invoice} />
          <Field label="Target Pay" value={targetPay} />
          <Field label="Target Comm" value={targetComm} />
          <Field label="Max Pay" value={maxPay} />
          <Field label="Max Comm" value={maxComm} />
        </div>
      </div>
    </div>
  );
}
