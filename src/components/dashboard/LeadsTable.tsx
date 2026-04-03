import React, { useState, useCallback, useRef, useEffect, useMemo, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { UserPlus, XCircle, ChevronDown, RotateCcw, Building2, Truck, ExternalLink, Trash2 } from "lucide-react";
import { LeadExpandedRow } from "./LeadExpandedRow";
import { LeadResolvePanel } from "./LeadResolvePanel";
import { HotLeadTimer } from "./HotLeadTimer";
import { PhoneDisplay } from "@/components/ui/phone-display";
import { formatPhone, cn } from "@/lib/utils";
import { LEADS_TABLE_LOADS_STYLE_CLASS } from "@/lib/loadTableDisplay";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;
type LeadStatus = "pending" | "claimed" | "booked" | "closed";

interface LeadsTableProps {
  leads: Lead[];
  isLoading: boolean;
  currentUserId?: string;
  agencyId?: string;
  onClaimLead: (leadId: string) => void;
  onUpdateStatus: (leadId: string, status: LeadStatus, action?: 'release' | 'reopen') => void;
  highlightPhone?: string | null;
  onHighlightConsumed?: () => void;
  showClaimedBy?: boolean;
  /** conversation_ids present in recent AI summaries with rate-agreed / booked outcome (from dashboard). */
  rateAgreedConversationIds?: ReadonlySet<string>;
  /** Normalized caller phones (digits only) for the same, when conversation_id is missing on the lead. */
  rateAgreedCallerPhones?: ReadonlySet<string>;
}

import { LEAD_STATUS_STYLES, LEAD_STATUS_LABELS } from "@/lib/leadStatusDisplay";

const statusStyles: Record<LeadStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300 cursor-pointer hover:bg-amber-200 transition-colors",
  claimed: "bg-blue-100 text-blue-800 border-blue-300 cursor-pointer hover:bg-blue-200 transition-colors",
  booked: "bg-green-100 text-green-800 border-green-300",
  closed: "bg-slate-100 text-slate-600 border-slate-300",
};

// Use shared labels - "pending" displays as "Lead"
const statusLabels: Record<LeadStatus, string> = LEAD_STATUS_LABELS;

// Follow-up status options for claimed leads
type FollowUpStatus = "contacted_waiting" | "carrier_callback" | "driver_callback" | "other" | null;

const FOLLOW_UP_OPTIONS: { value: FollowUpStatus; label: string }[] = [
  { value: null, label: "Not Set" },
  { value: "contacted_waiting", label: "Contacted/Waiting" },
  { value: "carrier_callback", label: "Carrier Callback" },
  { value: "driver_callback", label: "Driver Callback" },
  { value: "other", label: "Other" },
];

const getFollowUpLabel = (status: FollowUpStatus): string => {
  const option = FOLLOW_UP_OPTIONS.find(o => o.value === status);
  return option?.label || "Not Set";
};

export const LeadsTable = ({ 
  leads, 
  isLoading, 
  currentUserId,
  agencyId,
  onClaimLead, 
  onUpdateStatus,
  highlightPhone,
  onHighlightConsumed,
  showClaimedBy = false,
  rateAgreedConversationIds,
  rateAgreedCallerPhones,
}: LeadsTableProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const INITIAL_DISPLAY_COUNT = 25;
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [resolvePanelLead, setResolvePanelLead] = useState<Lead | null>(null);
  const [highlightedLeadId, setHighlightedLeadId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const handleNavigateToDetail = (leadId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate(`/leads/${leadId}`);
  };

  // Get unique claimed_by user IDs for fetching names
  const claimedByIds = useMemo(() => {
    if (!showClaimedBy) return [];
    return [...new Set(leads.filter(l => l.claimed_by).map(l => l.claimed_by as string))];
  }, [leads, showClaimedBy]);

  // Fetch profile names for claimed_by users
  const { data: profilesMap } = useQuery({
    queryKey: ["profiles", claimedByIds],
    queryFn: async () => {
      if (claimedByIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", claimedByIds);
      const map: Record<string, string> = {};
      data?.forEach(p => {
        map[p.id] = p.full_name || "Unknown";
      });
      return map;
    },
    enabled: showClaimedBy && claimedByIds.length > 0,
  });

  // Auto-expand lead when highlightPhone is set (from AI assistant deep link)
  useEffect(() => {
    if (highlightPhone && leads.length > 0) {
      // Normalize phone for comparison
      const normalizedHighlight = highlightPhone.replace(/\D/g, "");
      const matchedLead = leads.find((lead) => {
        const normalizedLeadPhone = lead.caller_phone?.replace(/\D/g, "") || "";
        return normalizedLeadPhone.includes(normalizedHighlight) || normalizedHighlight.includes(normalizedLeadPhone);
      });
      
      if (matchedLead) {
        setExpandedLeadId(matchedLead.id);
        setHighlightedLeadId(matchedLead.id);
        // Find index for focusing
        const index = leads.findIndex(l => l.id === matchedLead.id);
        if (index !== -1) {
          setFocusedIndex(index);
          // Scroll to the row after a brief delay
          setTimeout(() => {
            rowRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
            rowRefs.current[index]?.focus();
          }, 100);
        }
        
        // Clear highlight animation after 3 seconds
        setTimeout(() => {
          setHighlightedLeadId(null);
        }, 3000);
      }
      
      // Consume the highlight
      onHighlightConsumed?.();
    }
  }, [highlightPhone, leads, onHighlightConsumed]);

  const handleRowClick = (leadId: string) => {
    setExpandedLeadId(expandedLeadId === leadId ? null : leadId);
  };

  const handleOpenResolvePanel = (lead: Lead, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setResolvePanelLead(lead);
  };

  const handleResolveComplete = () => {
    setResolvePanelLead(null);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTableSectionElement>) => {
    if (leads.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < leads.length - 1 ? prev + 1 : prev;
          rowRefs.current[next]?.focus();
          return next;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : 0;
          rowRefs.current[next]?.focus();
          return next;
        });
        break;
      case "Enter":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < leads.length) {
          handleRowClick(leads[focusedIndex].id);
        }
        break;
      case "Escape":
        e.preventDefault();
        setExpandedLeadId(null);
        break;
    }
  }, [leads, focusedIndex]);

  const handleRowFocus = (index: number) => {
    setFocusedIndex(index);
  };

  // Mutation for updating follow-up status
  const updateFollowUpMutation = useMutation({
    mutationFn: async ({ leadId, followUpStatus }: { leadId: string; followUpStatus: string | null }) => {
      const { error } = await supabase
        .from("leads")
        .update({ follow_up_status: followUpStatus })
        .eq("id", leadId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Follow-up status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const handleFollowUpChange = (leadId: string, value: string) => {
    const followUpStatus = value === "null" ? null : value;
    updateFollowUpMutation.mutate({ leadId, followUpStatus });
  };

  // Multi-select helpers
  const visibleLeads = leads.slice(0, displayCount);
  const allVisibleSelected = visibleLeads.length > 0 && visibleLeads.every(l => selectedIds.has(l.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleLeads.map(l => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Delete mutation
  const deleteLeadsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Clear FK references first
      const { error: loadErr } = await supabase
        .from("loads")
        .update({ booked_lead_id: null } as any)
        .in("booked_lead_id", ids);
      if (loadErr) console.warn("Failed to clear load FK refs:", loadErr);

      // Delete lead events
      const { error: evtErr } = await supabase
        .from("lead_events")
        .delete()
        .in("lead_id", ids);
      if (evtErr) console.warn("Failed to delete lead events:", evtErr);

      // Delete leads
      const { error } = await supabase
        .from("leads")
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSelectedIds(new Set());
      toast({ title: `${ids.length} lead(s) deleted` });
    },
    onError: () => {
      toast({ title: "Failed to delete leads", variant: "destructive" });
    },
  });

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} lead(s)?`)) return;
    deleteLeadsMutation.mutate(Array.from(selectedIds));
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-8 shadow-sm dark:border-border dark:bg-card">
        <div className="flex items-center justify-center text-muted-foreground">
          <div className="animate-pulse">Loading leads...</div>
        </div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-12 text-center shadow-sm dark:border-border dark:bg-card">
        <p className="text-lg font-medium text-foreground">No leads found</p>
        <p className="text-sm text-muted-foreground mt-1">AI-generated leads will appear here</p>
      </div>
    );
  }

  return (
    <>
      {/* Resolve Lead Panel */}
      {resolvePanelLead && currentUserId && (
        <LeadResolvePanel
          open={!!resolvePanelLead}
          onOpenChange={(open) => !open && setResolvePanelLead(null)}
          lead={resolvePanelLead}
          agencyId={agencyId || resolvePanelLead.agency_id}
          currentUserId={currentUserId}
          onResolve={handleResolveComplete}
        />
      )}

      {/* Delete selected bar */}
      {someSelected && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2.5 dark:border-border dark:bg-muted/40">
          <span className="text-sm font-medium text-[#374151] dark:text-foreground">{selectedIds.size} selected</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={deleteLeadsMutation.isPending}
            className="h-8 gap-1.5 px-3 text-xs font-semibold shadow-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteLeadsMutation.isPending ? "Deleting..." : "Delete Selected"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="h-8 border-[#E5E7EB] bg-white text-xs font-medium dark:border-border dark:bg-background"
          >
            Clear
          </Button>
        </div>
      )}

      <div className="w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-white dark:border-border dark:bg-card">
      <div className="w-full min-w-0 overflow-x-auto">
      <Table className={LEADS_TABLE_LOADS_STYLE_CLASS}>
        <TableHeader>
          <TableRow className="border-b border-solid border-[#E5E7EB] bg-[#F9FAFB] hover:bg-[#F9FAFB] dark:border-border dark:bg-muted/40">
            <TableHead
              className="w-[40px] text-center align-middle"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inline-flex w-full justify-center">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </div>
            </TableHead>
            <TableHead className="text-left align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Date
            </TableHead>
            <TableHead className="w-[180px] text-left align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Phone
            </TableHead>
            <TableHead className="text-left align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Company
            </TableHead>
            <TableHead className="text-center align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Status
            </TableHead>
            <TableHead className="text-center align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Follow-Up
            </TableHead>
            {showClaimedBy && (
              <TableHead className="text-left align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
                Claimed By
              </TableHead>
            )}
            <TableHead className="text-right align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Intent
            </TableHead>
            <TableHead className="text-center align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Timer
            </TableHead>
            <TableHead className="w-[100px] text-center align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Actions
            </TableHead>
            <TableHead className="w-[40px] text-center align-middle" />
          </TableRow>
        </TableHeader>
        <TableBody onKeyDown={handleKeyDown}>
          {leads.slice(0, displayCount).map((lead, index) => {
            const status = lead.status as LeadStatus;
            const isPending = status === "pending";
            const isClaimed = status === "claimed";
            const isBooked = status === "booked";
            const isClosed = status === "closed";
            const isClaimedByMe = lead.claimed_by === currentUserId;
            const isExpanded = expandedLeadId === lead.id;
            const isFocused = focusedIndex === index;

            // Deep-link highlight animation
            const isHighlighted = highlightedLeadId === lead.id;
            const phoneDigits = (lead.caller_phone || "").replace(/\D/g, "");
            const showRateAgreedBadge =
              (lead.conversation_id && rateAgreedConversationIds?.has(lead.conversation_id)) ||
              (!!phoneDigits && rateAgreedCallerPhones?.has(phoneDigits));

            return (
              <React.Fragment key={lead.id}>
                <TableRow 
                  ref={(el: HTMLTableRowElement | null) => { if (el) rowRefs.current[index] = el; }}
                  tabIndex={0}
                  role="row"
                  aria-selected={isFocused}
                  aria-expanded={isExpanded}
                  className={cn(
                    "cursor-pointer border-b border-[#E5E7EB] bg-white outline-none transition-shadow transition-colors",
                    "hover:shadow-[0_2px_10px_rgba(0,0,0,0.07)] hover:bg-white",
                    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset dark:border-border dark:bg-card",
                    isExpanded && "bg-[#F9FAFB] dark:bg-muted/30",
                    isFocused && !isExpanded && "ring-1 ring-inset ring-[#E5E7EB] dark:ring-border",
                    isHighlighted && "animate-pulse ring-2 ring-[hsl(35,92%,50%)] ring-inset bg-[hsl(35,92%,50%)]/10",
                  )}
                  onClick={() => handleRowClick(lead.id)}
                  onFocus={() => handleRowFocus(index)}
                >
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    className="w-[40px] text-center align-middle"
                  >
                    <div className="inline-flex w-full justify-center">
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={() => toggleSelect(lead.id)}
                        aria-label={`Select lead ${formatPhone(lead.caller_phone)}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-left text-sm text-[#6B7280] tabular-nums dark:text-muted-foreground">
                    {format(new Date(lead.created_at), "MMM d, yyyy, h:mm a")}
                  </TableCell>
                  <TableCell className="w-[180px] text-left text-sm whitespace-nowrap align-middle">
                    <PhoneDisplay
                      phone={lead.caller_phone}
                      className="font-semibold text-[0.95rem] whitespace-nowrap"
                    />
                  </TableCell>
                  <TableCell className="min-w-[220px] text-left align-middle">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{lead.caller_company || "—"}</span>
                      {/* Shipper & Equipment Tags */}
                      {lead.shipper && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="outline" 
                              className="text-[10px] px-1.5 py-0 h-4 font-normal bg-purple-50 border-purple-300 text-purple-700"
                            >
                              <Building2 className="h-2.5 w-2.5 mr-0.5" />
                              {lead.shipper}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Shipper: Source account ({lead.shipper})</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {lead.equipment_type && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="outline" 
                              className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                                lead.equipment_type === "flatbed" 
                                  ? "bg-green-50 border-green-300 text-green-700"
                                  : "bg-red-50 border-red-300 text-red-700"
                              }`}
                            >
                              <Truck className="h-2.5 w-2.5 mr-0.5" />
                              {lead.equipment_type === "flatbed" ? "Flatbed" : "Non-Flatbed"}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              Equipment Type: {lead.equipment_type === "flatbed" 
                                ? "Flatbed (required for Aldelphia)" 
                                : "Non-flatbed (not compatible with Aldelphia)"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex w-full flex-wrap justify-center">
                    {(isPending || isClaimed) && (
                      <Badge 
                        className={statusStyles[status]}
                        onClick={(e) => handleOpenResolvePanel(lead, e)}
                      >
                        {statusLabels[status]}
                      </Badge>
                    )}
                    {(isBooked || isClosed) && (
                      <Badge className={statusStyles[status]}>
                        {statusLabels[status]}
                      </Badge>
                    )}
                    </div>
                  </TableCell>
                  {/* Follow-Up Status - Only for claimed leads */}
                  <TableCell className="text-center align-middle" onClick={(e) => e.stopPropagation()}>
                    {isClaimed ? (
                      <div className="inline-flex w-full justify-center">
                      <Select
                        value={lead.follow_up_status || "null"}
                        onValueChange={(value) => handleFollowUpChange(lead.id, value)}
                      >
                        <SelectTrigger className="mx-auto h-8 w-[140px] border-[#E5E7EB] text-xs dark:border-border">
                          <SelectValue placeholder="Not Set" />
                        </SelectTrigger>
                        <SelectContent>
                          {FOLLOW_UP_OPTIONS.map((option) => (
                            <SelectItem 
                              key={option.value || "null"} 
                              value={option.value || "null"}
                              className="text-xs"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      </div>
                    ) : (
                      <span className="block w-full text-center text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  {showClaimedBy && (
                    <TableCell className="text-left text-sm text-foreground align-middle">
                      {lead.claimed_by ? (profilesMap?.[lead.claimed_by] || "Loading...") : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right align-middle">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {showRateAgreedBadge && (
                        <Badge
                          className="border-0 bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white shadow-md ring-1 ring-emerald-600/40"
                          title="AI call: rate agreed or booking intent"
                        >
                          🔥 Rate Agreed
                        </Badge>
                      )}
                      {lead.is_high_intent ? (
                        <Badge variant="outline" className="border-emerald-500 text-emerald-700">
                          High Intent
                        </Badge>
                      ) : lead.intent_score !== null ? (
                        <span className="text-sm text-muted-foreground">
                          {lead.intent_score}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {/* Handle both array format (legacy) and object format (keyword match) */}
                      {lead.intent_reason_breakdown && (
                        <>
                          {/* New keyword match format */}
                          {typeof lead.intent_reason_breakdown === 'object' && !Array.isArray(lead.intent_reason_breakdown) && (lead.intent_reason_breakdown as Record<string, unknown>).keyword_match && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal bg-amber-100 text-amber-800 border-amber-300">
                                  🔑 {((lead.intent_reason_breakdown as Record<string, unknown>).keyword_match as Record<string, unknown>)?.keyword as string || 'Keyword'}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                Matched high-intent keyword in transcript
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {/* Legacy array format */}
                          {Array.isArray(lead.intent_reason_breakdown) && lead.intent_reason_breakdown.length > 0 && (
                            <>
                              {(lead.intent_reason_breakdown as string[]).slice(0, 2).map((reason, idx) => (
                                <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                  {reason.length > 12 ? `${reason.slice(0, 12)}…` : reason}
                                </Badge>
                              ))}
                              {lead.intent_reason_breakdown.length > 2 && (
                                <span className="text-[10px] text-muted-foreground">+{lead.intent_reason_breakdown.length - 2}</span>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <div className="inline-flex w-full justify-center">
                      <HotLeadTimer 
                        createdAt={lead.created_at} 
                        claimedAt={lead.claimed_at} 
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {/* View Detail Button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={(e) => handleNavigateToDetail(lead.id, e)}
                            className="h-8 w-8 shrink-0 p-0"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Details</TooltipContent>
                      </Tooltip>
                      
                      {/* Lead (pending): Claim */}
                      {isPending && (
                        <Button 
                          type="button"
                          variant="outline"
                          size="sm" 
                          onClick={() => onClaimLead(lead.id)}
                          className="h-8 gap-1.5 border-[#1F2937] bg-[#1F2937] px-2 text-xs font-semibold text-white shadow-none hover:bg-[#111827] hover:text-white sm:text-sm"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Claim
                        </Button>
                      )}
                      
                      {/* Claimed by me: Release Claim */}
                      {isClaimed && isClaimedByMe && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => onUpdateStatus(lead.id, "pending", "release")}
                          className="h-8 gap-1.5 border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#374151] hover:bg-[#F9FAFB] dark:border-border dark:bg-background dark:text-foreground"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Release
                        </Button>
                      )}
                      
                      {/* Booked/Closed: Reopen */}
                      {(isBooked || isClosed) && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => onUpdateStatus(lead.id, "pending", "reopen")}
                          className="h-8 gap-1.5 border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#374151] hover:bg-[#F9FAFB] dark:border-border dark:bg-background dark:text-foreground"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reopen
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell 
                    className="cursor-pointer text-center align-middle hover:bg-[#F9FAFB] dark:hover:bg-muted/40"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(lead.id);
                    }}
                  >
                    <div className="inline-flex w-full justify-center">
                      <ChevronDown 
                        className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} 
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${lead.id}-expanded`}>
                    <TableCell colSpan={11 + (showClaimedBy ? 1 : 0)} className="p-0">
                      <LeadExpandedRow
                        lead={lead}
                        agencyId={agencyId || lead.agency_id}
                        currentUserId={currentUserId}
                        onClaimLead={onClaimLead}
                        onUpdateStatus={onUpdateStatus}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
      </div>
      
      {/* Load More / Show All */}
      {leads.length > displayCount && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-[#E5E7EB] py-4 dark:border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDisplayCount((prev) => prev + 25)}
            className="border-[#E5E7EB] bg-white font-medium dark:border-border dark:bg-background"
          >
            Load More ({leads.length - displayCount} remaining)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDisplayCount(leads.length)}
            className="font-medium text-[#6B7280] hover:text-[#374151] dark:text-muted-foreground"
          >
            Show All ({leads.length})
          </Button>
        </div>
      )}
      </div>
    </>
  );
};
