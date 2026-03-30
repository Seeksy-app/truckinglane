/**
 * PostgREST `or` clause for loads list / dashboard: exclude dispatch_status = 'archived'.
 * Keeps rows where dispatch_status is null or any value other than archived.
 */
export const LOADS_EXCLUDE_ARCHIVED_DISPATCH_OR =
  "dispatch_status.is.null,dispatch_status.neq.archived" as const;

/** Same filter for raw REST `?or=` (parentheses required). */
export const LOADS_EXCLUDE_ARCHIVED_DISPATCH_OR_REST = `(${LOADS_EXCLUDE_ARCHIVED_DISPATCH_OR})`;
