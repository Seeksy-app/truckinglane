import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

/** Aljex-style lane label: state code first, then city (e.g. "TX HOUSTON"). */
export function formatLaneStateCity(
  state: string | null | undefined,
  city: string | null | undefined,
): string | null {
  const s = state?.trim();
  const c = city?.trim();
  if (s && c) return `${s.toUpperCase()} ${c}`;
  return null;
}

/** Sort by state code, then city within state. */
export function compareLoadsByStateThenCity(
  a: Load,
  b: Load,
  column: "pickup" | "delivery",
  dir: "asc" | "desc",
): number {
  const sign = dir === "asc" ? 1 : -1;
  const sa =
    column === "pickup"
      ? (a.pickup_state || "").trim().toUpperCase()
      : (a.dest_state || "").trim().toUpperCase();
  const sb =
    column === "pickup"
      ? (b.pickup_state || "").trim().toUpperCase()
      : (b.dest_state || "").trim().toUpperCase();
  const stateCmp = sa.localeCompare(sb);
  if (stateCmp !== 0) return stateCmp * sign;
  const ca =
    column === "pickup"
      ? (a.pickup_city || "").trim().toLowerCase()
      : (a.dest_city || "").trim().toLowerCase();
  const cb =
    column === "pickup"
      ? (b.pickup_city || "").trim().toLowerCase()
      : (b.dest_city || "").trim().toLowerCase();
  return ca.localeCompare(cb) * sign;
}
