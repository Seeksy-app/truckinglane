import type { Tables } from "@/integrations/supabase/types";

type Load = Tables<"loads">;

/**
 * Dashboard data tables (loads, leads, AI calls): centered headers/cells, compact padding.
 * Use LOADS_TABLE_DENSE_CLASS for loads-only single-line nowrap.
 */
export const DASHBOARD_TABLE_CENTERED_DENSE_CLASS =
  "w-full border-collapse text-[11px] leading-tight sm:text-xs [&_th]:!h-8 [&_th]:!px-1.5 [&_th]:!py-1.5 [&_th]:!text-center [&_td]:!px-1.5 [&_td]:!py-1 [&_td]:!text-center [&_td]:align-middle [&_th]:align-middle";

/**
 * Loads table: roomier rows (py-4 body cells) while keeping the same text scale as before
 * (table base is still text-[11px] sm:text-xs; body cells override with text-sm sm:text-base in components).
 */
export const LOADS_TABLE_DENSE_CLASS =
  "w-full border-collapse text-[11px] leading-tight sm:text-xs [&_th]:!h-auto [&_th]:!min-h-[3.25rem] [&_th]:!px-1.5 [&_th]:!py-4 [&_th]:align-middle [&_td]:!px-1.5 [&_td]:!py-4 [&_td]:align-middle [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap";

/** AI Calls list: left-aligned cells, same row padding and font scale as Loads dense table. */
export const CALLS_TABLE_DENSE_CLASS =
  "w-full border-collapse text-[11px] leading-tight sm:text-xs [&_th]:!h-8 [&_th]:!px-1.5 [&_th]:!py-1.5 [&_th]:!text-left [&_th]:align-middle [&_td]:!px-1.5 [&_td]:!py-1 [&_td]:!text-left [&_td]:align-middle";

/**
 * Leads list: same header/cell scale and bottom border language as Open Loads; body cells may wrap.
 */
export const LEADS_TABLE_LOADS_STYLE_CLASS =
  "w-full border-collapse text-[11px] leading-tight sm:text-xs [&_th]:!h-auto [&_th]:!min-h-[3.25rem] [&_th]:!px-1.5 [&_th]:!py-4 [&_th]:align-middle [&_td]:!px-1.5 [&_td]:!py-4 [&_td]:align-middle [&_td]:!whitespace-normal [&_th]:whitespace-nowrap";

/** AI Calls list: same rhythm as Leads; per-cell text-align set in DashboardCallsTable. */
export const CALLS_TABLE_LOADS_STYLE_CLASS = LEADS_TABLE_LOADS_STYLE_CLASS;

/** Toolbar strip above loads table — same font scale as load row cells (text-sm / sm:text-base). */
export const LOADS_TABLE_TOOLBAR_CLASS =
  "flex flex-wrap items-center gap-2 px-2 py-3 border-b border-border bg-muted/30 text-sm sm:text-base";

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
