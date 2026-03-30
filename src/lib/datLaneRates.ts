import { mapEquipmentCode } from "@/lib/datExport";
import type { Tables } from "@/integrations/supabase/types";

const DEFAULT_DAT_LANE_RATES_URL = "https://axel.podlogix.io/tl/dat-lane-rates";

/** Same header as Dashboard DAT sync / extension (demo). */
export const TL_TRIGGER_KEY_HEADER = "tl-trigger-7b747d391801b8e5f55b4542";

export type DatLanePosting = {
  rate: number | null;
  miles: number | null;
  company: string;
  age_label: string;
};

export type DatLaneRatesResponse = {
  ok: boolean;
  cached?: boolean;
  error?: string;
  unavailable?: boolean;
  average_rate?: number | null;
  postings?: DatLanePosting[];
};

function laneRatesUrl(): string {
  const v = import.meta.env.VITE_DAT_LANE_RATES_URL as string | undefined;
  return (v && v.trim()) || DEFAULT_DAT_LANE_RATES_URL;
}

export async function fetchDatLaneRates(params: {
  pickup_city: string;
  pickup_state: string;
  dest_city: string;
  dest_state: string;
  equipment: string;
}): Promise<DatLaneRatesResponse> {
  let res: Response;
  try {
    res = await fetch(laneRatesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-trigger-key": TL_TRIGGER_KEY_HEADER,
      },
      body: JSON.stringify(params),
    });
  } catch {
    return { ok: false, unavailable: true, error: "Network error" };
  }

  let data: DatLaneRatesResponse;
  try {
    data = (await res.json()) as DatLaneRatesResponse;
  } catch {
    return { ok: false, unavailable: true, error: "Invalid response from rate server" };
  }

  if (!res.ok) {
    return {
      ok: false,
      unavailable: true,
      error: data?.error || `HTTP ${res.status}`,
    };
  }

  return data;
}

export function buildLaneRatesParams(load: Tables<"loads">): {
  pickup_city: string;
  pickup_state: string;
  dest_city: string;
  dest_state: string;
  equipment: string;
} | null {
  const pc = (load.pickup_city || "").trim();
  const ps = (load.pickup_state || "").trim();
  const dc = (load.dest_city || "").trim();
  const ds = (load.dest_state || "").trim();
  if (!pc || !ps || !dc || !ds) return null;
  return {
    pickup_city: pc,
    pickup_state: ps,
    dest_city: dc,
    dest_state: ds,
    equipment: mapEquipmentCode(load.trailer_type, load.template_type),
  };
}
