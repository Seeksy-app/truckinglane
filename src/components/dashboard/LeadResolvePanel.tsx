import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ShieldCheck,
  ShieldOff,
  Truck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Json, Tables } from "@/integrations/supabase/types";
import { LEAD_STATUS_LABELS } from "@/lib/leadStatusDisplay";

type Lead = Tables<"leads">;
type LeadStatus = "pending" | "claimed" | "booked" | "closed";

type OutcomeType = 
  | "booked" 
  | "covered"
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

interface LeadResolvePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  agencyId: string;
  currentUserId: string;
  onResolve: () => void;
}

const OUTCOMES: { value: OutcomeType; label: string; icon: typeof Package; description: string; color: string; iconColor: string }[] = [
  { 
    value: "booked", 
    label: "Booked", 
    icon: Package,
    description: "Attach load & book",
    color: "border-green-300 hover:border-green-500 data-[selected=true]:border-green-500 data-[selected=true]:bg-green-50",
    iconColor: "text-green-600"
  },
  { 
    value: "covered", 
    label: "Covered", 
    icon: Truck,
    description: "Load already covered",
    color: "border-emerald-300 hover:border-emerald-500 data-[selected=true]:border-emerald-500 data-[selected=true]:bg-emerald-50",
    iconColor: "text-emerald-600"
  },
  { 
    value: "callback_needed", 
    label: "Callback", 
    icon: PhoneMissed,
    description: "Schedule follow-up",
    color: "border-amber-300 hover:border-amber-500 data-[selected=true]:border-amber-500 data-[selected=true]:bg-amber-50",
    iconColor: "text-amber-600"
  },
  { 
    value: "no_answer", 
    label: "No Answer", 
    icon: Phone,
    description: "Try again later",
    color: "border-blue-300 hover:border-blue-500 data-[selected=true]:border-blue-500 data-[selected=true]:bg-blue-50",
    iconColor: "text-blue-600"
  },
  { 
    value: "closed", 
    label: "Closed", 
    icon: XCircle,
    description: "Close lead",
    color: "border-slate-300 hover:border-slate-500 data-[selected=true]:border-slate-500 data-[selected=true]:bg-slate-50",
    iconColor: "text-slate-600"
  },
  { 
    value: "not_a_fit", 
    label: "Not a Fit", 
    icon: Ban,
    description: "Wrong fit",
    color: "border-red-300 hover:border-red-500 data-[selected=true]:border-red-500 data-[selected=true]:bg-red-50",
    iconColor: "text-red-600"
  },
];

const CLOSE_REASONS: { value: CloseReason; label: string }[] = [
  { value: "rate_too_low", label: "Rate too low" },
  { value: "load_unavailable", label: "Load unavailable" },
  { value: "not_a_fit", label: "Not a fit" },
  { value: "other", label: "Other" },
];

export function LeadResolvePanel({
  open,
  onOpenChange,
  lead,
  agencyId,
  currentUserId,
  onResolve,
}: LeadResolvePanelProps) {
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

  // Reset state when panel opens
  useEffect(() => {
    if (open) {
      setOutcome(null);
      setCloseReason(null);
      setSelectedLoadId(lead.load_id || null);
      setLoadSearch("");
      setSearchResults([]);
    }
  }, [open, lead.load_id]);

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

  // Log event to lead_events
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

        case "covered":
          leadUpdate.status = "closed";
          leadUpdate.closed_at = now;
          leadUpdate.close_reason = "covered";
          leadUpdate.resolved_at = now;
          eventMeta.close_reason = "covered";
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
            loadUpdate = {
              status: "closed",
              closed_at: now,
              close_reason: closeReason,
            };
            eventMeta.load_id = selectedLoadId || lead.load_id;
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

      // Log event
      logEvent("resolved", eventMeta);

      const messages: Record<OutcomeType, { title: string; desc: string }> = {
        booked: { title: "Booked!", desc: "Lead and load are now booked" },
        covered: { title: "Covered", desc: "Lead closed as covered" },
        closed: { title: "Closed", desc: "Lead has been closed" },
        callback_needed: { title: "Callback Set", desc: "Follow-up scheduled" },
        no_answer: { title: "Logged", desc: "No answer recorded" },
        not_a_fit: { title: "Closed", desc: "Lead closed as not a fit" },
      };

      toast({ title: messages[outcome].title, description: messages[outcome].desc });

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
    if (!outcome) return false;
    if (outcome === "booked" && !selectedLoadId) return false;
    if (outcome === "closed" && !closeReason) return false;
    return true;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <SheetTitle className="text-lg font-bold">Resolve Lead</SheetTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium text-foreground truncate">{lead.caller_name || "Unknown"}</span>
                <span className="text-muted-foreground/50">•</span>
                <span className="font-mono text-xs">{lead.caller_phone}</span>
              </div>
            </div>
            <Badge className={cn(
              "text-[10px] shrink-0 uppercase tracking-wide",
              status === "pending" && "bg-amber-100 text-amber-800 border-amber-300",
              status === "claimed" && "bg-blue-100 text-blue-800 border-blue-300",
              status === "booked" && "bg-green-100 text-green-800 border-green-300",
              status === "closed" && "bg-slate-100 text-slate-600 border-slate-300"
            )}>
              {LEAD_STATUS_LABELS[status]}
            </Badge>
          </div>
          {lead.carrier_verified_at ? (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-[10px]">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Verified {lead.carrier_usdot && `DOT ${lead.carrier_usdot}`}
              </Badge>
            </div>
          ) : lead.carrier_usdot && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]">
                <ShieldOff className="h-3 w-3 mr-1" />
                Unverified DOT {lead.carrier_usdot}
              </Badge>
            </div>
          )}
        </SheetHeader>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-4">
            {/* Outcome Selection */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outcome</h4>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setOutcome(opt.value)}
                    data-selected={outcome === opt.value}
                    className={cn(
                      "relative flex items-center gap-2.5 p-2.5 rounded-lg border-2 text-left transition-all",
                      opt.color
                    )}
                  >
                    <div className={cn("h-7 w-7 rounded-md flex items-center justify-center bg-white shadow-sm shrink-0", opt.iconColor)}>
                      <opt.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{opt.description}</div>
                    </div>
                    {outcome === opt.value && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary absolute top-1.5 right-1.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Load Selection for Booked */}
            {needsLoadSelection && (
              <div className="space-y-3 p-3 rounded-lg bg-green-50/50 border border-green-200">
                <h4 className="text-xs font-semibold text-foreground">Which load was booked?</h4>

                {isLoadingSuggestions ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-white rounded border">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Finding matches...
                  </div>
                ) : displayedLoads.length > 0 ? (
                  <div className="space-y-1.5">
                    {searchResults.length === 0 && loadSuggestions.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-primary" />
                        AI suggestions
                      </div>
                    )}
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {displayedLoads.map((load) => (
                        <button
                          key={load.id}
                          onClick={() => setSelectedLoadId(load.id)}
                          className={cn(
                            "w-full flex items-center gap-2 p-2 rounded border bg-white text-left transition-all text-xs",
                            selectedLoadId === load.id
                              ? "border-primary ring-1 ring-primary/20"
                              : "border-slate-200 hover:border-primary/40"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-mono font-bold">#{load.load_number}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {load.pickup_city}, {load.pickup_state} → {load.dest_city}, {load.dest_state}
                            </div>
                          </div>
                          {load.target_pay && (
                            <div className="font-semibold">${load.target_pay.toLocaleString()}</div>
                          )}
                          {selectedLoadId === load.id && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground p-2 bg-white rounded border flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    No matches. Search below.
                  </div>
                )}

                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      value={loadSearch}
                      onChange={(e) => setLoadSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLoadSearch()}
                      placeholder="City or load #"
                      className="pl-7 h-8 text-xs bg-white"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={handleLoadSearch} disabled={isSearching} className="h-8 px-2">
                    {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Close Reason */}
            {needsCloseReason && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <h4 className="text-xs font-semibold text-foreground">Close reason</h4>
                <RadioGroup value={closeReason || ""} onValueChange={(v) => setCloseReason(v as CloseReason)} className="space-y-1">
                  {CLOSE_REASONS.map((reason) => (
                    <div key={reason.value} className="flex items-center space-x-2 p-2 rounded bg-white border border-slate-200 hover:border-slate-300">
                      <RadioGroupItem value={reason.value} id={reason.value} className="h-3.5 w-3.5" />
                      <Label htmlFor={reason.value} className="text-xs cursor-pointer flex-1">{reason.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* Confirmation for quick outcomes */}
            {(outcome === "callback_needed" || outcome === "no_answer" || outcome === "covered" || outcome === "not_a_fit") && (
              <div className={cn(
                "p-2.5 rounded-lg border flex items-center gap-2 text-xs",
                outcome === "callback_needed" && "bg-amber-50 border-amber-200 text-amber-800",
                outcome === "no_answer" && "bg-blue-50 border-blue-200 text-blue-800",
                outcome === "covered" && "bg-emerald-50 border-emerald-200 text-emerald-800",
                outcome === "not_a_fit" && "bg-red-50 border-red-200 text-red-800"
              )}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {outcome === "callback_needed" && "Callback will be scheduled"}
                {outcome === "no_answer" && "Contact attempt will be logged"}
                {outcome === "covered" && "Lead will close as covered"}
                {outcome === "not_a_fit" && "Lead will close as not a fit"}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit()}
            size="sm"
            className="gap-1.5 bg-[hsl(35,92%,50%)] hover:bg-[hsl(35,92%,45%)] min-w-[100px]"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Confirm
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
