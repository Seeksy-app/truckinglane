import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

/**
 * Dashboard data tables (loads, leads, AI calls): centered headers/cells, compact padding.
 * Use LOADS_TABLE_DENSE_CLASS for loads-only single-line nowrap.
 */
export const DASHBOARD_TABLE_CENTERED_DENSE_CLASS =
  "w-full border-collapse text-[11px] leading-tight sm:text-xs [&_th]:!h-8 [&_th]:!px-1.5 [&_th]:!py-1.5 [&_th]:!text-center [&_td]:!px-1.5 [&_td]:!py-1 [&_td]:!text-center [&_td]:align-middle [&_th]:align-middle";

/** Loads table: same as dashboard dense + nowrap for single-line lanes. */
export const LOADS_TABLE_DENSE_CLASS =
  `${DASHBOARD_TABLE_CENTERED_DENSE_CLASS} [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap`;

/** AI Calls list: left-aligned cells, same row padding and font scale as Loads dense table. */
export const CALLS_TABLE_DENSE_CLASS =
  "w-full border-collapse text-[11px] leading-tight sm:text-xs [&_th]:!h-8 [&_th]:!px-1.5 [&_th]:!py-1.5 [&_th]:!text-left [&_th]:align-middle [&_td]:!px-1.5 [&_td]:!py-1 [&_td]:!text-left [&_td]:align-middle";

/** Toolbar strip above loads table — font scale matches dense table body (text-sm / sm:text-base). */
export const LOADS_TABLE_TOOLBAR_CLASS =
  "flex flex-wrap items-center gap-2 px-1.5 py-2 border-b border-border bg-muted/30 text-sm sm:text-base";

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
