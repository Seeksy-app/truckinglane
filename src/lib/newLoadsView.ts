/** UTC calendar date YYYY-MM-DD */
export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today at 12:00:00.000 UTC (morning import window baseline). */
export function getTodayNoonUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0),
  );
}

const LAST_VIEWED_PREFIX = "tl_last_viewed_loads_at_";

export function lastViewedLoadsStorageKey(userId: string): string {
  return `${LAST_VIEWED_PREFIX}${userId}`;
}

/** One-day floor (11am EST) for 2026-03-27 — remove after rollout is stable. */
const QUICK_FIX_2026_03_27_FLOOR = new Date("2026-03-27T15:00:00.000Z");

/**
 * Baseline time: loads with created_at strictly after this count as "new" (open loads only).
 * - Per-user localStorage `tl_last_viewed_loads_at_<userId>` (ISO string).
 * - Missing or stale (stored date before today UTC): default to today 12:00 UTC.
 * - 2026-03-27: never count anything at/before 15:00 UTC floor (quick fix).
 */
export function getEffectiveNewLoadsThresholdUtc(userId: string, now: Date = new Date()): Date {
  if (typeof window === "undefined") {
    return getTodayNoonUtc(now);
  }

  const key = lastViewedLoadsStorageKey(userId);
  const todayStr = utcDateString(now);
  const storedRaw = localStorage.getItem(key);

  let effective: Date;

  if (!storedRaw) {
    effective = getTodayNoonUtc(now);
  } else {
    const stored = new Date(storedRaw);
    if (Number.isNaN(stored.getTime())) {
      effective = getTodayNoonUtc(now);
    } else if (utcDateString(stored) < todayStr) {
      effective = getTodayNoonUtc(now);
    } else {
      effective = stored;
    }
  }

  if (todayStr === "2026-03-27") {
    const floor = QUICK_FIX_2026_03_27_FLOOR;
    effective = effective.getTime() > floor.getTime() ? effective : floor;
  }

  return effective;
}

export function setLastViewedLoadsAtNow(userId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(lastViewedLoadsStorageKey(userId), new Date().toISOString());
}
