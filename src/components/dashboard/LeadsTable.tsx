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
import { Card } from "@/components/ui/card";
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
import { formatPhone } from "@/lib/utils";
import { DASHBOARD_TABLE_CENTERED_DENSE_CLASS } from "@/lib/loadTableDisplay";
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
  showClaimedBy = false
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
      <Card className="p-8">
        <div className="flex items-center justify-center text-muted-foreground">
          <div className="animate-pulse">Loading leads...</div>
        </div>
      </Card>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
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
        <div className="flex items-center gap-3 px-2 py-2 bg-destructive/10 border-b border-border">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={deleteLeadsMutation.isPending}
            className="gap-1.5 h-7 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteLeadsMutation.isPending ? "Deleting..." : "Delete Selected"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="h-7 text-xs"
          >
            Clear
          </Button>
        </div>
      )}

      <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="w-full min-w-0 overflow-x-auto">
      <Table className={DASHBOARD_TABLE_CENTERED_DENSE_CLASS}>
        <TableHeader>
          <TableRow className="bg-muted/50 border-b border-border">
            <TableHead className="w-[40px]" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-center">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </div>
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Date</TableHead>
            <TableHead className="w-[180px] text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Phone</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Company</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Status</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Follow-Up</TableHead>
            {showClaimedBy && (
              <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Claimed By</TableHead>
            )}
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Intent</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Timer</TableHead>
            <TableHead className="w-[100px] text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">Actions</TableHead>
            <TableHead className="w-[40px]" />
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

            // Lead rows (status=pending) get highlight
            const leadHighlight = isPending 
              ? "bg-[hsl(38,92%,50%)]/5 hover:bg-[hsl(38,92%,50%)]/10" 
              : "";

            // Deep-link highlight animation
            const isHighlighted = highlightedLeadId === lead.id;

            return (
              <React.Fragment key={lead.id}>
                <TableRow 
                  ref={(el: HTMLTableRowElement | null) => { if (el) rowRefs.current[index] = el; }}
                  tabIndex={0}
                  role="row"
                  aria-selected={isFocused}
                  aria-expanded={isExpanded}
                  className={`cursor-pointer outline-none focus:ring-2 focus:ring-primary focus:ring-inset ${leadHighlight} ${isExpanded ? "bg-muted/20" : ""} ${isFocused && !isPending ? "bg-muted/10 hover:bg-muted/30" : ""} ${!isPending && !isExpanded && !isFocused ? "hover:bg-muted/30" : ""} ${isHighlighted ? "animate-pulse ring-2 ring-[hsl(35,92%,50%)] ring-inset bg-[hsl(35,92%,50%)]/10" : ""}`}
                  onClick={() => handleRowClick(lead.id)}
                  onFocus={() => handleRowFocus(index)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()} className="w-[40px]">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={() => toggleSelect(lead.id)}
                        aria-label={`Select lead ${formatPhone(lead.caller_phone)}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground tabular-nums">
                    {format(new Date(lead.created_at), "MMM d, yyyy, h:mm a")}
                  </TableCell>
                  <TableCell className="w-[180px] text-sm whitespace-nowrap text-center">
                    <div className="flex justify-center">
                      <PhoneDisplay
                        phone={lead.caller_phone}
                        className="font-semibold text-[0.95rem] whitespace-nowrap"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[220px] text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
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
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-center">
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
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {isClaimed ? (
                      <div className="flex justify-center">
                      <Select
                        value={lead.follow_up_status || "null"}
                        onValueChange={(value) => handleFollowUpChange(lead.id, value)}
                      >
                        <SelectTrigger className="h-7 text-xs w-[140px] mx-auto">
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
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  {showClaimedBy && (
                    <TableCell className="text-sm text-foreground text-center">
                      {lead.claimed_by ? (profilesMap?.[lead.claimed_by] || "Loading...") : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
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
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <HotLeadTimer 
                        createdAt={lead.created_at} 
                        claimedAt={lead.claimed_at} 
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {/* View Detail Button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={(e) => handleNavigateToDetail(lead.id, e)}
                            className="h-7 w-7 p-0"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Details</TooltipContent>
                      </Tooltip>
                      
                      {/* Lead (pending): Claim */}
                      {isPending && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => onClaimLead(lead.id)}
                          className="gap-1.5 h-7 text-xs"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Claim
                        </Button>
                      )}
                      
                      {/* Claimed by me: Release Claim */}
                      {isClaimed && isClaimedByMe && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => onUpdateStatus(lead.id, "pending", "release")}
                          className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Release
                        </Button>
                      )}
                      
                      {/* Booked/Closed: Reopen */}
                      {(isBooked || isClosed) && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => onUpdateStatus(lead.id, "pending", "reopen")}
                          className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reopen
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell 
                    className="cursor-pointer hover:bg-muted/50 text-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(lead.id);
                    }}
                  >
                    <div className="flex justify-center">
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
        <div className="flex items-center justify-center gap-3 py-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDisplayCount((prev) => prev + 25)}
          >
            Load More ({leads.length - displayCount} remaining)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDisplayCount(leads.length)}
          >
            Show All ({leads.length})
          </Button>
        </div>
      )}
      </div>
    </>
  );
};
