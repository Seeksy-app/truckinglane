/**
 * Lead Status Display Mapping
 * 
 * Maps internal database status values to user-facing display labels.
 * Keeps database stable with "pending" while displaying "Lead" to users.
 */

export type LeadStatus = "pending" | "claimed" | "booked" | "closed";

/**
 * User-facing display labels for lead statuses.
 * "pending" is displayed as "Lead" per UX requirements.
 */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  pending: "Lead",
  claimed: "Claimed",
  booked: "Booked",
  closed: "Closed",
};

/**
 * Extended outcome types for lead resolution
 */
export type LeadOutcome = 
  | "booked" 
  | "closed" 
  | "covered"
  | "callback_needed"
  | "no_answer"
  | "not_a_fit";

/**
 * Get the display label for a lead status.
 * @param status - The internal database status
 * @returns The user-facing display label
 */
export function getLeadStatusLabel(status: LeadStatus | string): string {
  return LEAD_STATUS_LABELS[status as LeadStatus] || status;
}

/**
 * Status styles for UI badges
 */
export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  claimed: "bg-blue-500/15 text-blue-700",
  booked: "bg-emerald-500/15 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
};
