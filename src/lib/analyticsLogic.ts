/**
 * TRUCKINGLANE ANALYTICS LOGIC
 * 
 * This file contains the canonical definitions for all analytics metrics.
 * All analytics must derive from events tables (calls, leads, loads), NOT from agent_daily_state.
 * 
 * DEFINITIONS:
 * - Total Calls: Any inbound or outbound call attempt
 * - Engaged Calls: Call ≥20s OR resulted in Lead OR tagged High Intent
 * - Quick Hangups: Call <10s
 * - Lead: Exists if call ≥20s OR agent marked intent OR AI classified intent OR load claimed
 * - High Intent: Explicit agent tag OR AI confidence ≥ threshold OR call ≥45s (configurable)
 * 
 * INVARIANT: If Leads > 0, then Engaged Calls must be > 0
 */

// Threshold constants (configurable)
export const ENGAGED_THRESHOLD_SECS = 20;
export const QUICK_HANGUP_THRESHOLD_SECS = 10;
export const HIGH_INTENT_DURATION_THRESHOLD_SECS = 45;

// Type definitions for call data from various sources
export interface CallRecord {
  id: string;
  created_at: string;
  duration_seconds?: number | null;
  duration_secs?: number | null;
  call_duration_secs?: number | null;
  is_high_intent?: boolean | null;
  call_outcome?: string | null;
  termination_reason?: string | null;
}

export interface LeadRecord {
  id: string;
  status: string;
  created_at: string;
  is_high_intent?: boolean | null;
  intent_score?: number | null;
  phone_call_id?: string | null;
  booked_at?: string | null;
  closed_at?: string | null;
}

export interface LoadRecord {
  id: string;
  status: string;
  is_active: boolean;
  created_at: string;
  booked_at?: string | null;
  booked_source?: string | null;
}

/**
 * Normalizes duration from various call record formats
 * Returns null if no duration is available (not 0!)
 */
export function getCallDuration(call: CallRecord): number | null {
  const duration = call.duration_seconds ?? call.duration_secs ?? call.call_duration_secs;
  return duration ?? null;
}

/**
 * Determines if a call is "engaged" according to the canonical definition:
 * - Duration >= 20 seconds
 * - OR resulted in a Lead (pass lead if available)
 * - OR tagged as High Intent
 */
export function isEngagedCall(call: CallRecord, associatedLead?: LeadRecord | null): boolean {
  const duration = getCallDuration(call);
  
  // Duration >= threshold (only if we have a real duration)
  if (duration !== null && duration >= ENGAGED_THRESHOLD_SECS) return true;
  
  // Tagged as high intent
  if (call.is_high_intent) return true;
  
  // Has an associated lead
  if (associatedLead) return true;
  
  return false;
}

/**
 * Determines if a call is a "quick hangup"
 * Duration < 10 seconds - ONLY if we have a real duration value
 * NULL duration means "unknown", not "0 seconds"
 */
export function isQuickHangup(call: CallRecord): boolean {
  const duration = getCallDuration(call);
  // Only count as quick hangup if we have an actual duration value
  if (duration === null) return false;
  return duration < QUICK_HANGUP_THRESHOLD_SECS;
}

/**
 * Determines if a call/lead qualifies as "high intent"
 * - Explicit agent tag
 * - AI confidence >= threshold
 * - Call duration >= 45s (configurable)
 */
export function isHighIntent(
  call?: CallRecord | null,
  lead?: LeadRecord | null,
  intentThreshold: number = 70
): boolean {
  // Lead is explicitly marked high intent
  if (lead?.is_high_intent) return true;
  
  // Lead has high intent score
  if (lead?.intent_score && lead.intent_score >= intentThreshold) return true;
  
  // Call is marked high intent
  if (call?.is_high_intent) return true;
  
  // Call duration >= threshold (only if we have a real duration)
  if (call) {
    const duration = getCallDuration(call);
    if (duration !== null && duration >= HIGH_INTENT_DURATION_THRESHOLD_SECS) return true;
  }
  
  return false;
}

/**
 * Calculates all analytics metrics from raw data
 */
export interface AnalyticsMetrics {
  totalCalls: number;
  engagedCalls: number;
  quickHangups: number;
  totalLeads: number;
  highIntentCount: number;
  bookedLeads: number;
  closedLeads: number;
  pendingLeads: number;
  claimedLeads: number;
  totalMinutes: number;
  openLoads: number;
  bookedLoads: number;
  closedLoads: number;
  aiBookedLoads: number;
  // Conversion rates
  callToLeadRate: number;
  callToBookedRate: number;
  leadToBookedRate: number;
  engagementRate: number;
  // Validation warnings
  warnings: string[];
}

/**
 * Map leads to calls by phone_call_id for engaged calculation
 */
function buildCallToLeadMap(leads: LeadRecord[]): Map<string, LeadRecord> {
  const map = new Map<string, LeadRecord>();
  for (const lead of leads) {
    if (lead.phone_call_id) {
      map.set(lead.phone_call_id, lead);
    }
  }
  return map;
}

/**
 * Calculate comprehensive analytics metrics from raw data
 */
export function calculateAnalyticsMetrics(
  calls: CallRecord[],
  leads: LeadRecord[],
  loads: LoadRecord[]
): AnalyticsMetrics {
  const callToLeadMap = buildCallToLeadMap(leads);
  const warnings: string[] = [];
  
  // Call metrics
  const totalCalls = calls.length;
  
  let engagedCalls = 0;
  let quickHangups = 0;
  let totalSeconds = 0;
  let highIntentCallCount = 0;
  
  for (const call of calls) {
    const duration = getCallDuration(call);
    totalSeconds += duration ?? 0; // Only add if we have a real value
    
    const associatedLead = callToLeadMap.get(call.id);
    
    if (isEngagedCall(call, associatedLead)) {
      engagedCalls++;
    }
    
    if (isQuickHangup(call)) {
      quickHangups++;
    }
    
    if (isHighIntent(call, associatedLead)) {
      highIntentCallCount++;
    }
  }
  
  // Lead metrics
  const totalLeads = leads.length;
  const pendingLeads = leads.filter(l => l.status === 'pending').length;
  const claimedLeads = leads.filter(l => l.status === 'claimed').length;
  const bookedLeads = leads.filter(l => l.status === 'booked').length;
  const closedLeads = leads.filter(l => l.status === 'closed').length;
  
  // High intent from leads
  const highIntentLeads = leads.filter(l => isHighIntent(null, l)).length;
  const highIntentCount = Math.max(highIntentCallCount, highIntentLeads);
  
  // Load metrics
  const activeLoads = loads.filter(l => l.is_active);
  const openLoads = activeLoads.filter(l => l.status === 'open').length;
  const bookedLoads = loads.filter(l => l.status === 'booked').length;
  const closedLoads = loads.filter(l => l.status === 'closed').length;
  const aiBookedLoads = loads.filter(l => l.status === 'booked' && l.booked_source === 'ai').length;
  
  // Calculate rates (avoid division by zero)
  const callToLeadRate = totalCalls > 0 ? (totalLeads / totalCalls) * 100 : 0;
  const callToBookedRate = totalCalls > 0 ? (bookedLoads / totalCalls) * 100 : 0;
  const leadToBookedRate = totalLeads > 0 ? (bookedLeads / totalLeads) * 100 : 0;
  const engagementRate = totalCalls > 0 ? (engagedCalls / totalCalls) * 100 : 0;
  
  // Validation: If leads > 0, engaged must be > 0
  // This is an invariant - if we have leads, some calls must have been engaged
  if (totalLeads > 0 && engagedCalls === 0) {
    // Auto-correct: leads imply engaged calls
    engagedCalls = Math.min(totalLeads, totalCalls);
    warnings.push(`Corrected: Leads (${totalLeads}) > 0 implies Engaged Calls should be > 0. Set to ${engagedCalls}.`);
  }
  
  // Validation: High intent should imply calls
  if (highIntentCount > 0 && totalCalls === 0) {
    warnings.push(`Data anomaly: High Intent (${highIntentCount}) > 0 but Total Calls = 0.`);
  }
  
  return {
    totalCalls,
    engagedCalls,
    quickHangups,
    totalLeads,
    highIntentCount,
    bookedLeads,
    closedLeads,
    pendingLeads,
    claimedLeads,
    totalMinutes: Math.round(totalSeconds / 60 * 10) / 10,
    openLoads,
    bookedLoads,
    closedLoads,
    aiBookedLoads,
    callToLeadRate: Math.round(callToLeadRate * 10) / 10,
    callToBookedRate: Math.round(callToBookedRate * 10) / 10,
    leadToBookedRate: Math.round(leadToBookedRate * 10) / 10,
    engagementRate: Math.round(engagementRate * 10) / 10,
    warnings,
  };
}

/**
 * Tooltip definitions for metrics - ensures UI matches logic exactly
 */
export const METRIC_TOOLTIPS = {
  totalCalls: {
    label: "Total Calls",
    description: "Any inbound or outbound call attempt in the selected period.",
  },
  engagedCalls: {
    label: "Engaged Calls",
    description: `Calls ≥${ENGAGED_THRESHOLD_SECS} seconds OR resulting in a Lead OR tagged High Intent.`,
  },
  quickHangups: {
    label: "Quick Hangups",
    description: `Calls under ${QUICK_HANGUP_THRESHOLD_SECS} seconds, typically disconnects or wrong numbers.`,
  },
  highIntent: {
    label: "High Intent",
    description: `Calls/leads with explicit high-intent tag, AI confidence ≥70%, or call duration ≥${HIGH_INTENT_DURATION_THRESHOLD_SECS}s.`,
  },
  leads: {
    label: "Leads",
    description: "Contacts created from calls meeting engagement criteria.",
  },
  conversion: {
    label: "Conversion",
    description: "Percentage of calls that resulted in a booked load.",
  },
  callbackSpeed: {
    label: "Callback Speed",
    description: "Median time from AI identifying high intent to agent placing follow-up call.",
  },
  aiMinutes: {
    label: "AI Minutes",
    description: "Total minutes of AI-handled call time.",
  },
  engagementRate: {
    label: "Engagement Rate",
    description: "Percentage of calls that resulted in meaningful engagement.",
  },
} as const;
