/**
 * Dashboard "NEW" loads: open loads that belong to the **latest import batch** only.
 *
 * We use the two most recent `load_activity_logs` rows with action = import:
 * - `lastImportAt` = end of latest sync (log row time)
 * - `previousImportAt` = prior sync (or null for the first import)
 *
 * A load is in the latest batch when its created_at is after the previous import
 * and on/before the latest import log time. (A single `>= lastImportAt` rule
 * would miss loads when the audit row is inserted after the upsert.)
 */
export function isOpenLoadInLatestImportBatch(
  load: { created_at: string; status: string; is_active: boolean | null },
  lastImportAt: string | null,
  previousImportAt: string | null,
): boolean {
  if (!load.is_active || load.status !== "open") return false;
  if (!lastImportAt) return false;
  const created = new Date(load.created_at).getTime();
  const tLast = new Date(lastImportAt).getTime();
  const tPrev = previousImportAt ? new Date(previousImportAt).getTime() : 0;
  return created > tPrev && created <= tLast;
}
