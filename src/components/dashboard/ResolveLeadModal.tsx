import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { 
  Package, 
  XCircle, 
  PhoneMissed,
  Loader2,
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Ban,
  Phone,
  User,
  ShieldCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Json, Tables } from "@/integrations/supabase/types";
import { LEAD_STATUS_LABELS } from "@/lib/leadStatusDisplay";

type Lead = Tables<"leads">;
type LeadStatus = "pending" | "claimed" | "booked" | "closed";

type OutcomeType = 
  | "booked" 
  | "closed" 
  | "callback_needed"
  | "no_answer"
  | "not_a_fit";

type CloseReason = 
  | "rate_too_low"
  | "load_unavailable" 
  | "not_a_fit"
  | "covered"
  | "other";

interface LoadSuggestion {
  id: string;
  load_number: string;
  pickup_city: string | null;
  pickup_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  trailer_type: string | null;
  customer_invoice_total: number | null;
  target_pay: number | null;
  confidence: "high" | "medium" | "low";
  match_reason: string;
}

interface ResolveLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  agencyId: string;
  currentUserId: string;
  onResolve: () => void;
  initialMode?: "resolve" | "attach";
}

const OUTCOMES = [
  { 
    value: "booked" as const, 
    label: "Booked", 
    icon: Package,
    description: "Mark lead and load as booked",
    color: "bg-green-50 border-green-200 hover:border-green-400 data-[selected=true]:border-green-500 data-[selected=true]:bg-green-100",
    iconColor: "text-green-600"
  },
  { 
    value: "callback_needed" as const, 
    label: "Callback Needed", 
    icon: PhoneMissed,
    description: "Schedule follow-up call",
    color: "bg-amber-50 border-amber-200 hover:border-amber-400 data-[selected=true]:border-amber-500 data-[selected=true]:bg-amber-100",
    iconColor: "text-amber-600"
  },
  { 
    value: "no_answer" as const, 
    label: "No Answer", 
    icon: Phone,
    description: "No pickup, try again later",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400 data-[selected=true]:border-blue-500 data-[selected=true]:bg-blue-100",
    iconColor: "text-blue-600"
  },
  { 
    value: "closed" as const, 
    label: "Closed", 
    icon: XCircle,
    description: "Close lead and attached load",
    color: "bg-slate-50 border-slate-200 hover:border-slate-400 data-[selected=true]:border-slate-500 data-[selected=true]:bg-slate-100",
    iconColor: "text-slate-600"
  },
  { 
    value: "not_a_fit" as const, 
    label: "Not a Fit", 
    icon: Ban,
    description: "Close as not a fit",
    color: "bg-red-50 border-red-200 hover:border-red-400 data-[selected=true]:border-red-500 data-[selected=true]:bg-red-100",
    iconColor: "text-red-600"
  },
];

const CLOSE_REASONS: { value: CloseReason; label: string }[] = [
  { value: "covered", label: "Load already covered" },
  { value: "rate_too_low", label: "Rate too low" },
  { value: "load_unavailable", label: "Load unavailable" },
  { value: "not_a_fit", label: "Not a fit" },
  { value: "other", label: "Other" },
];

export function ResolveLeadModal({
  open,
  onOpenChange,
  lead,
  agencyId,
  currentUserId,
  onResolve,
  initialMode = "resolve",
}: ResolveLeadModalProps) {
  const [mode, setMode] = useState<"resolve" | "attach">(initialMode);
  const [outcome, setOutcome] = useState<OutcomeType | null>(null);
  const [closeReason, setCloseReason] = useState<CloseReason | null>(null);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(lead.load_id || null);
  const [loadSuggestions, setLoadSuggestions] = useState<LoadSuggestion[]>([]);
  const [loadSearch, setLoadSearch] = useState("");
  const [searchResults, setSearchResults] = useState<LoadSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setOutcome(null);
      setCloseReason(null);
      setSelectedLoadId(lead.load_id || null);
      setLoadSearch("");
      setSearchResults([]);
    }
  }, [open, lead.load_id, initialMode]);

  // Fetch AI-suggested loads on mount
  useEffect(() => {
    if (!open) return;
    
    async function fetchSuggestions() {
      setIsLoadingSuggestions(true);
      try {
        const response = await fetch(
          `https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/ai-assistant`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow`,
            },
            body: JSON.stringify({
              action: "suggest-loads",
              agencyId,
              leadId: lead.id,
            }),
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          setLoadSuggestions(data.suggestions || []);
        }
      } catch (e) {
        console.error("Failed to fetch load suggestions:", e);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }
    
    fetchSuggestions();
  }, [open, agencyId, lead.id]);

  // Search loads by city/route
  const handleLoadSearch = useCallback(async () => {
    if (!loadSearch.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow`,
          },
          body: JSON.stringify({
            action: "suggest-loads",
            agencyId,
            queryText: loadSearch,
          }),
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.suggestions || []);
      }
    } catch (e) {
      console.error("Failed to search loads:", e);
    } finally {
      setIsSearching(false);
    }
  }, [agencyId, loadSearch]);

  // Log event to lead_events (fire-and-forget)
  const logEvent = useCallback(async (eventType: string, meta: Record<string, unknown> = {}) => {
    try {
      const metaJson = meta as unknown as Json;
      await supabase.from("lead_events").insert([{
        lead_id: lead.id,
        agent_id: currentUserId,
        event_type: eventType,
        meta: metaJson,
      }]);
    } catch (e) {
      console.error("Failed to log event:", e);
    }
  }, [lead.id, currentUserId]);

  // Handle resolution submit
  const handleSubmit = async () => {
    if (!outcome) return;
    
    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      
      const leadUpdate: Record<string, unknown> = {
        last_contact_attempt_at: now,
      };
      
      let loadUpdate: Record<string, unknown> | null = null;
      let eventType = "resolved";
      const eventMeta: Record<string, unknown> = { outcome };

      switch (outcome) {
        case "booked":
          if (!selectedLoadId) {
            toast({
              title: "Select a load",
              description: "Please select which load was booked",
              variant: "destructive",
            });
            setIsSubmitting(false);
            return;
          }
          leadUpdate.status = "booked";
          leadUpdate.load_id = selectedLoadId;
          leadUpdate.booked_by = currentUserId;
          leadUpdate.booked_at = now;
          leadUpdate.resolved_at = now;
          loadUpdate = {
            status: "booked",
            booked_by: currentUserId,
            booked_at: now,
            booked_source: "ai",
            booked_lead_id: lead.id,
          };
          eventMeta.load_id = selectedLoadId;
          break;

        case "closed":
          if (!closeReason) {
            toast({
              title: "Select a reason",
              description: "Please select why this lead is being closed",
              variant: "destructive",
            });
            setIsSubmitting(false);
            return;
          }
          leadUpdate.status = "closed";
          leadUpdate.closed_at = now;
          leadUpdate.close_reason = closeReason;
          leadUpdate.resolved_at = now;
          eventMeta.close_reason = closeReason;
          
          if (selectedLoadId || lead.load_id) {
            const attachedLoadId = selectedLoadId || lead.load_id;
            loadUpdate = {
              status: "closed",
              closed_at: now,
              close_reason: closeReason,
            };
            eventMeta.load_id = attachedLoadId;
          }
          break;

        case "callback_needed":
          leadUpdate.callback_requested_at = now;
          eventMeta.action = "callback_scheduled";
          break;

        case "no_answer":
          leadUpdate.last_contact_attempt_at = now;
          eventMeta.action = "no_answer";
          break;

        case "not_a_fit":
          leadUpdate.status = "closed";
          leadUpdate.closed_at = now;
          leadUpdate.close_reason = "not_a_fit";
          leadUpdate.resolved_at = now;
          eventMeta.close_reason = "not_a_fit";
          
          if (selectedLoadId || lead.load_id) {
            const attachedLoadId = selectedLoadId || lead.load_id;
            loadUpdate = {
              status: "closed",
              closed_at: now,
              close_reason: "not_a_fit",
            };
            eventMeta.load_id = attachedLoadId;
          }
          break;
      }

      // Update lead
      const { error: leadError } = await supabase
        .from("leads")
        .update(leadUpdate)
        .eq("id", lead.id);

      if (leadError) throw leadError;

      // Update load if needed
      const loadIdToUpdate = selectedLoadId || lead.load_id;
      if (loadUpdate && loadIdToUpdate) {
        const { error: loadError } = await supabase
          .from("loads")
          .update(loadUpdate)
          .eq("id", loadIdToUpdate);

        if (loadError) throw loadError;
      }

      // Log event (fire-and-forget)
      logEvent(eventType, eventMeta);

      toast({
        title: outcome === "booked" 
          ? "Booked!" 
          : outcome === "closed" || outcome === "not_a_fit"
          ? "Lead Closed"
          : outcome === "callback_needed"
          ? "Callback Scheduled"
          : "Logged",
        description: outcome === "booked" 
          ? "Lead and load are now booked" 
          : outcome === "closed" || outcome === "not_a_fit"
          ? "Lead has been closed"
          : outcome === "callback_needed"
          ? "Follow-up callback scheduled"
          : "Contact attempt logged",
      });

      onResolve();
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to resolve lead:", e);
      toast({
        title: "Error",
        description: "Failed to resolve lead. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const needsLoadSelection = outcome === "booked";
  const needsCloseReason = outcome === "closed";
  const displayedLoads = searchResults.length > 0 ? searchResults : loadSuggestions;
  const status = lead.status as LeadStatus;

  const canSubmit = () => {
    // Attach mode only requires a load selection
    if (mode === "attach") return !!selectedLoadId;
    // Resolve mode requires an outcome
    if (!outcome) return false;
    if (outcome === "booked" && !selectedLoadId) return false;
    if (outcome === "closed" && !closeReason) return false;
    return true;
  };

  // Handle attach-only submit
  const handleAttachLoad = async () => {
    if (!selectedLoadId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ load_id: selectedLoadId })
        .eq("id", lead.id);

      if (error) throw error;

      logEvent("load_attached", { load_id: selectedLoadId });

      toast({
        title: "Load Attached",
        description: "The load has been linked to this lead",
      });

      onResolve();
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to attach load:", e);
      toast({
        title: "Error",
        description: "Failed to attach load. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold">
                {mode === "attach" ? "Attach Load to Lead" : "Resolve Lead"}
              </DialogTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  <span className="font-medium text-foreground">{lead.caller_name || "Unknown"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4" />
                  <span className="font-mono">{lead.caller_phone}</span>
                </div>
              </div>
            </div>
            <Badge className={cn(
              "text-xs",
              status === "pending" && "bg-amber-100 text-amber-800 border-amber-300",
              status === "claimed" && "bg-blue-100 text-blue-800 border-blue-300",
              status === "booked" && "bg-green-100 text-green-800 border-green-300",
              status === "closed" && "bg-slate-100 text-slate-600 border-slate-300"
            )}>
              {LEAD_STATUS_LABELS[status]}
            </Badge>
          </div>
          {lead.carrier_verified_at && (
            <div className="flex items-center gap-2 mt-2 text-sm">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Carrier Verified
                {lead.carrier_usdot && <span className="ml-1 font-mono">DOT {lead.carrier_usdot}</span>}
              </Badge>
            </div>
          )}
        </DialogHeader>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Step 1: Outcome Selection - only show in resolve mode */}
          {mode === "resolve" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
                Select Outcome
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {OUTCOMES.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setOutcome(opt.value);
                      logEvent("outcome_selected", { outcome: opt.value });
                    }}
                    data-selected={outcome === opt.value}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all",
                      opt.color
                    )}
                  >
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center bg-white shadow-sm",
                      opt.iconColor
                    )}>
                      <opt.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                    </div>
                    {outcome === opt.value && (
                      <CheckCircle2 className="h-5 w-5 text-primary absolute top-2 right-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Load selection - show for booked outcome OR attach mode */}
          {(needsLoadSelection || mode === "attach") && (
            <div className="space-y-4 p-4 rounded-xl bg-blue-50/50 border border-blue-200">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                  {mode === "attach" ? "1" : "2"}
                </span>
                {mode === "attach" ? "Select a load to attach" : "Which load was booked?"}
              </h4>

              {/* AI Suggested Loads */}
              {isLoadingSuggestions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-white rounded-lg border">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Finding matching loads...
                </div>
              ) : displayedLoads.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.length === 0 && loadSuggestions.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      AI suggested matches
                    </div>
                  )}
                  <div className="grid gap-2 max-h-48 overflow-y-auto">
                    {displayedLoads.map((load) => (
                      <button
                        key={load.id}
                        onClick={() => {
                          setSelectedLoadId(load.id);
                          logEvent("load_attached", { load_id: load.id });
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border bg-white text-left transition-all",
                          selectedLoadId === load.id
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-slate-200 hover:border-primary/40"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-bold text-sm">
                              Load #{load.load_number}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                load.confidence === "high" 
                                  ? "border-green-400 text-green-700 bg-green-50"
                                  : load.confidence === "medium"
                                  ? "border-amber-400 text-amber-700 bg-amber-50"
                                  : "border-slate-300 text-slate-600"
                              )}
                            >
                              {load.confidence}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {load.pickup_city}, {load.pickup_state} → {load.dest_city}, {load.dest_state}
                            {load.trailer_type && ` • ${load.trailer_type}`}
                          </div>
                        </div>
                        {load.target_pay && (
                          <div className="text-sm font-bold text-foreground">
                            ${load.target_pay.toLocaleString()}
                          </div>
                        )}
                        {selectedLoadId === load.id && (
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground p-3 bg-white rounded-lg border flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  No matching loads found. Try searching below.
                </div>
              )}

              {/* Load Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={loadSearch}
                    onChange={(e) => setLoadSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLoadSearch()}
                    placeholder="Search by city or load #..."
                    className="pl-9 bg-white"
                  />
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLoadSearch}
                  disabled={isSearching}
                >
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2b: Close Reason */}
          {needsCloseReason && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
                Why is this lead being closed?
              </h4>
              <RadioGroup 
                value={closeReason || ""} 
                onValueChange={(v) => setCloseReason(v as CloseReason)}
                className="grid grid-cols-1 gap-2"
              >
                {CLOSE_REASONS.map((reason) => (
                  <div key={reason.value} className="flex items-center space-x-3 p-3 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-colors">
                    <RadioGroupItem value={reason.value} id={reason.value} />
                    <Label htmlFor={reason.value} className="text-sm cursor-pointer flex-1">
                      {reason.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Auto timestamps for callback/no answer */}
          {(outcome === "callback_needed" || outcome === "no_answer") && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-2 text-sm text-blue-800">
                <CheckCircle2 className="h-4 w-4" />
                {outcome === "callback_needed" 
                  ? "Callback timestamp will be set automatically"
                  : "Last contact attempt will be logged"
                }
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-slate-50/50">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={mode === "attach" ? handleAttachLoad : handleSubmit}
            disabled={isSubmitting || !canSubmit()}
            className="gap-2 min-w-[160px]"
            size="lg"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {mode === "attach" ? "Attach Load" : "Confirm & Resolve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
