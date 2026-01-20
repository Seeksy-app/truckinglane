import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  RotateCcw, Play, Pause, Volume2, 
  Flame, Copy, Check, FileText, Zap, Loader2, StickyNote, Link2, ShieldCheck, UserPlus, Pencil, X, Search, Building2, Truck
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { TranscriptViewerModal } from "@/components/analytics/TranscriptViewerModal";
import { toast } from "@/hooks/use-toast";
import { ResolveLeadModal } from "./ResolveLeadModal";
import type { Tables, Json } from "@/integrations/supabase/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_STYLES } from "@/lib/leadStatusDisplay";
import { cn } from "@/lib/utils";

const AudioPlayer = ({ url }: { url: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-3">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setIsPlaying(false)}
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={togglePlay}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </Button>
      <div className="flex-1">
        <div className="h-1 bg-border rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-100"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-mono">
        {formatTime(currentTime)} / {formatTime(duration || 0)}
      </span>
      <Volume2 className="h-4 w-4 text-muted-foreground" />
    </div>
  );
};

type Lead = Tables<"leads">;
type LeadStatus = "pending" | "claimed" | "booked" | "closed";

interface LeadExpandedRowProps {
  lead: Lead;
  agencyId: string;
  currentUserId?: string;
  onClaimLead: (leadId: string) => void;
  onUpdateStatus: (leadId: string, status: LeadStatus, action?: 'release' | 'reopen') => void;
}

const statusStyles: Record<LeadStatus, string> = LEAD_STATUS_STYLES;
const statusLabels: Record<LeadStatus, string> = LEAD_STATUS_LABELS;

export const LeadExpandedRow = ({ 
  lead,
  agencyId,
  currentUserId,
  onClaimLead,
  onUpdateStatus 
}: LeadExpandedRowProps) => {
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  
  // State
  const [copied, setCopied] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveModalMode, setResolveModalMode] = useState<"resolve" | "attach">("resolve");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notes, setNotes] = useState(lead.notes || "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<Date | null>(null);
  const [transcriptModal, setTranscriptModal] = useState<{
    open: boolean;
    transcript: string | null;
    summary?: string | null;
    summaryTitle?: string | null;
    callInfo?: {
      externalNumber?: string;
      duration?: number;
      outcome?: string;
      createdAt?: string;
    };
  }>({ open: false, transcript: null });
  
  // Load edit state
  const [isLoadEditOpen, setIsLoadEditOpen] = useState(false);
  const [loadSearchQuery, setLoadSearchQuery] = useState("");

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync notes when lead changes
  useEffect(() => {
    setNotes(lead.notes || "");
  }, [lead.notes]);

  // Fetch conversation data from conversations table or ai_call_summaries
  const { data: conversation } = useQuery({
    queryKey: ["lead-conversation", lead.id, lead.caller_phone],
    queryFn: async () => {
      // First try conversation_id
      if (lead.conversation_id) {
        const { data, error } = await supabase
          .from("conversations")
          .select("summary, transcript, recording_url")
          .eq("id", lead.conversation_id)
          .maybeSingle();

        if (error) throw error;
        if (data) return { ...data, source: "conversations" as const };
      }
      
      // Then try phone_call_id
      if (lead.phone_call_id) {
        const { data, error } = await supabase
          .from("conversations")
          .select("summary, transcript, recording_url")
          .eq("phone_call_id", lead.phone_call_id)
          .maybeSingle();

        if (error) throw error;
        if (data) return { ...data, source: "conversations" as const };
      }
      
      // Fallback: check ai_call_summaries by phone number
      if (lead.caller_phone) {
        const { data, error } = await supabase
          .from("ai_call_summaries")
          .select("summary, summary_short, summary_title, transcript, duration_secs, call_outcome, termination_reason, carrier_name, carrier_usdot, carrier_mc, is_high_intent, high_intent_reasons, call_cost_credits")
          .eq("external_number", lead.caller_phone)
          .eq("agency_id", agencyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (data) return { 
          summary: data.summary || data.summary_short,
          transcript: data.transcript,
          recording_url: null,
          source: "ai_call_summaries" as const,
          // Additional AI call data
          summaryTitle: data.summary_title,
          duration: data.duration_secs,
          outcome: data.call_outcome,
          terminationReason: data.termination_reason,
          carrierName: data.carrier_name,
          carrierUsdot: data.carrier_usdot,
          carrierMc: data.carrier_mc,
          isHighIntent: data.is_high_intent,
          highIntentReasons: data.high_intent_reasons,
          callCostCredits: data.call_cost_credits,
        };
      }
      
      return null;
    },
    enabled: true, // Always try to fetch - we have multiple fallbacks
  });

  // Fetch attached load data
  const { data: attachedLoad } = useQuery({
    queryKey: ["lead-attached-load", lead.load_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loads")
        .select("id, load_number, pickup_city, pickup_state, dest_city, dest_state, trailer_type, trailer_footage, ship_date, rate_raw, is_per_ton, customer_invoice_total, target_pay, target_commission, max_pay, max_commission, weight_lbs, miles, commodity, tarps, tarp_size, tarp_required, load_call_script")
        .eq("id", lead.load_id!)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!lead.load_id,
  });

  // Search for loads by load number
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["load-search", agencyId, loadSearchQuery],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loads")
        .select("id, load_number, pickup_city, pickup_state, dest_city, dest_state, trailer_type")
        .eq("agency_id", agencyId)
        .eq("is_active", true)
        .ilike("load_number", `%${loadSearchQuery}%`)
        .limit(5);
      
      if (error) throw error;
      return data;
    },
    enabled: isLoadEditOpen && loadSearchQuery.length >= 2,
  });

  // Update load assignment mutation
  const updateLoadMutation = useMutation({
    mutationFn: async (newLoadId: string | null) => {
      const { error } = await supabase
        .from("leads")
        .update({ load_id: newLoadId })
        .eq("id", lead.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-attached-load", lead.load_id] });
      setIsLoadEditOpen(false);
      setLoadSearchQuery("");
      toast({ title: "Load updated" });
    },
    onError: (error) => {
      console.error("Failed to update load:", error);
      toast({ title: "Failed to update load", variant: "destructive" });
    },
  });

  // Save notes function
  const saveNotes = useCallback(async (newNotes: string) => {
    setIsSavingNotes(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ notes: newNotes })
        .eq("id", lead.id);

      if (error) throw error;

      setNotesSavedAt(new Date());
      
      // Log event (fire-and-forget)
      const eventMeta = { notes_length: newNotes.length } as unknown as Json;
      supabase.from("lead_events").insert([{
        lead_id: lead.id,
        agent_id: currentUserId,
        event_type: "note_updated",
        meta: eventMeta,
      }]).then(() => {});

    } catch (e) {
      console.error("Failed to save notes:", e);
      toast({ 
        title: "Failed to save notes", 
        description: "Your changes were not saved. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsSavingNotes(false);
    }
  }, [lead.id, currentUserId]);

  // Handle notes change with debounce
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setNotes(newNotes);
    setNotesSavedAt(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      saveNotes(newNotes);
    }, 700);
  };

  // Handle notes blur - save immediately
  const handleNotesBlur = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    
    if (notes !== lead.notes) {
      saveNotes(notes);
    }
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // No scroll effect needed for modal

  // Focus notes when opened
  useEffect(() => {
    if (isNotesOpen && notesRef.current) {
      notesRef.current.focus();
    }
  }, [isNotesOpen]);

  const status = lead.status as LeadStatus;
  const isPending = status === "pending";
  const isClaimed = status === "claimed";
  const isBooked = status === "booked";
  const isClosed = status === "closed";
  const isHighIntent = lead.is_high_intent;
  const canResolve = (isPending || isClaimed) && currentUserId;

  const summaryText = conversation?.summary || lead.notes || null;
  const hasTranscript = !!conversation?.transcript;

  const handleCopySummary = async () => {
    const textToCopy = summaryText || lead.caller_name || '';
    if (!textToCopy) {
      toast({ title: "No summary to copy", variant: "destructive" });
      return;
    }
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast({ title: "Summary copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleViewTranscript = () => {
    setTranscriptModal({
      open: true,
      transcript: conversation?.transcript || null,
      summary: summaryText,
      summaryTitle: conversation?.summaryTitle || lead.caller_name,
      callInfo: {
        externalNumber: lead.caller_phone,
        duration: conversation?.duration,
        outcome: conversation?.outcome || status,
        createdAt: lead.created_at,
      },
    });
  };

  const handleResolve = () => {
    setIsResolveModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["loads"] });
  };

  const handleOpenNotes = () => {
    setIsNotesOpen(true);
  };

  const handleOpenResolve = () => {
    setResolveModalMode("resolve");
    setIsResolveModalOpen(true);
  };

  const handleOpenAttachLoad = () => {
    setResolveModalMode("attach");
    setIsResolveModalOpen(true);
  };

  return (
    <>
      {/* Resolve Lead Modal */}
      {canResolve && (
        <ResolveLeadModal
          open={isResolveModalOpen}
          onOpenChange={setIsResolveModalOpen}
          lead={lead}
          agencyId={agencyId}
          currentUserId={currentUserId!}
          onResolve={handleResolve}
          initialMode={resolveModalMode}
        />
      )}

      <div ref={panelRef} className="p-5 bg-white border-t border-border/50 space-y-4">
        {/* PRIMARY ACTION STRIP - Always visible at top */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border/50">
          {/* Claim button for pending leads */}
          {isPending && currentUserId && (
            <Button
              onClick={() => onClaimLead(lead.id)}
              className="gap-2 font-semibold"
              size="sm"
            >
              <UserPlus className="h-4 w-4" />
              Claim Lead
            </Button>
          )}
          
          {canResolve && (
            <Button
              onClick={handleOpenResolve}
              variant={isPending ? "outline" : "default"}
              className="gap-2 font-semibold"
              size="sm"
            >
              <Zap className="h-4 w-4" />
              Resolve Lead
            </Button>
          )}
          
          <Button
            variant={isNotesOpen ? "secondary" : "outline"}
            size="sm"
            onClick={handleOpenNotes}
            className="gap-2"
          >
            <StickyNote className="h-4 w-4" />
            Add Notes
          </Button>
          
          {canResolve && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenAttachLoad}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" />
              Attach Load
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewTranscript}
            disabled={!hasTranscript}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            View Transcript
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopySummary}
            className="gap-2"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copy
          </Button>
          
          {/* Unclaim for claimed leads */}
          {isClaimed && currentUserId && lead.claimed_by === currentUserId && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onUpdateStatus(lead.id, "pending", "release")}
              className="gap-2 ml-auto"
            >
              <RotateCcw className="h-4 w-4" />
              Unclaim
            </Button>
          )}
          
          {/* Reopen actions for booked/closed */}
          {(isBooked || isClosed) && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onUpdateStatus(lead.id, "pending", "reopen")}
              className="gap-2 ml-auto"
            >
              <RotateCcw className="h-4 w-4" />
              Reopen
            </Button>
          )}
        </div>

        {/* Notes Panel - Opens below action strip */}
        {isNotesOpen && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Agent Notes
              </label>
              <span className="text-xs text-muted-foreground">
                {isSavingNotes && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving...
                  </span>
                )}
                {!isSavingNotes && notesSavedAt && (
                  <span className="text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Saved {format(notesSavedAt, "h:mm a")}
                  </span>
                )}
              </span>
            </div>
            <Textarea
              ref={notesRef}
              value={notes}
              onChange={handleNotesChange}
              onBlur={handleNotesBlur}
              placeholder="Add notes about this lead..."
              className="min-h-[100px] text-sm resize-none"
            />
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsNotesOpen(false)}
              className="text-xs"
            >
              Done
            </Button>
          </div>
        )}

        {/* Lead Info Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-semibold text-foreground text-lg">
              {lead.caller_name || "Lead Details"}
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusStyles[status]}>
                {statusLabels[status]}
              </Badge>
              {isHighIntent && (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1">
                  <Flame className="h-3 w-3" />
                  High Intent
                </Badge>
              )}
              {lead.callback_requested_at && (
                <Badge variant="outline" className="text-xs">
                  Callback {format(new Date(lead.callback_requested_at), "MMM d, h:mm a")}
                </Badge>
              )}
              {lead.load_id && (
                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-500/30">
                  <Link2 className="h-3 w-3 mr-1" />
                  Load Attached
                </Badge>
              )}
              {lead.carrier_verified_at && (
                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/30">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Carrier Verified
                  {lead.carrier_usdot && <span className="ml-1 font-mono">DOT {lead.carrier_usdot}</span>}
                </Badge>
              )}
              {/* Shipper and Equipment Tags */}
              {lead.shipper && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-700 border-purple-500/30 gap-1">
                      <Building2 className="h-3 w-3" />
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
                      className={`text-xs gap-1 ${
                        lead.equipment_type === "flatbed"
                          ? "bg-green-500/10 text-green-700 border-green-500/30"
                          : "bg-red-500/10 text-red-700 border-red-500/30"
                      }`}
                    >
                      <Truck className="h-3 w-3" />
                      {lead.equipment_type === "flatbed" ? "Flatbed" : "Non-Flatbed"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Equipment Type: {lead.equipment_type === "flatbed" 
                        ? "Flatbed (required for Aldelphia loads)" 
                        : "Non-flatbed equipment (not compatible with Aldelphia)"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        
        {/* AI Call Intelligence Summary */}
        {conversation?.summary && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground font-medium">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              AI Call Intelligence
              {conversation.summaryTitle && (
                <span className="text-foreground font-semibold normal-case">— {conversation.summaryTitle}</span>
              )}
            </div>
            <div className={cn(
              "rounded-lg p-4 border-l-4",
              conversation.summary.toLowerCase().includes("could not find") || 
              conversation.summary.toLowerCase().includes("didn't match") ||
              conversation.summary.toLowerCase().includes("no match") ||
              conversation.summary.toLowerCase().includes("no loads")
                ? "bg-amber-50 border-l-amber-500 border border-amber-200"
                : "bg-card border border-border border-l-primary/50"
            )}>
              {(conversation.summary.toLowerCase().includes("could not find") || 
                conversation.summary.toLowerCase().includes("didn't match") ||
                conversation.summary.toLowerCase().includes("no match") ||
                conversation.summary.toLowerCase().includes("no loads")) && (
                <div className="flex items-center gap-2 mb-2 text-amber-700 text-xs font-medium">
                  <Flame className="h-3.5 w-3.5" />
                  Load Search Unsuccessful — Follow up recommended
                </div>
              )}
              <p className="text-sm text-foreground leading-relaxed">
                {conversation.summary}
              </p>
              
              {/* AI Call Metadata Grid */}
              {conversation.source === "ai_call_summaries" && (
                <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {conversation.outcome && (
                    <div>
                      <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Outcome</span>
                      <span className="font-medium capitalize text-foreground">{conversation.outcome.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {conversation.duration !== null && conversation.duration !== undefined && (
                    <div>
                      <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Duration</span>
                      <span className="font-medium font-mono text-foreground">{Math.floor(conversation.duration / 60)}:{(conversation.duration % 60).toString().padStart(2, '0')}</span>
                    </div>
                  )}
                  {conversation.callCostCredits !== null && conversation.callCostCredits !== undefined && (
                    <div>
                      <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Call Cost</span>
                      <span className="font-medium font-mono text-foreground">{conversation.callCostCredits.toLocaleString()} credits</span>
                    </div>
                  )}
                  {conversation.carrierName && (
                    <div>
                      <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Carrier</span>
                      <span className="font-medium text-foreground">{conversation.carrierName}</span>
                    </div>
                  )}
                  {(conversation.carrierUsdot || conversation.carrierMc) && (
                    <div>
                      <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">DOT / MC</span>
                      <span className="font-mono font-medium text-foreground">
                        {conversation.carrierUsdot && `DOT ${conversation.carrierUsdot}`}
                        {conversation.carrierUsdot && conversation.carrierMc && ' / '}
                        {conversation.carrierMc && `MC ${conversation.carrierMc}`}
                      </span>
                    </div>
                  )}
                  {conversation.terminationReason && (
                    <div>
                      <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Call Ended</span>
                      <span className="font-medium capitalize text-foreground">{conversation.terminationReason.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio Player if available */}
        {conversation?.recording_url && (
          <AudioPlayer url={conversation.recording_url} />
        )}
        
        {/* Meta grid: Phone, Load #, Company, Intent, Created */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
          <div>
            <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">Phone</span>
            <a href={`tel:${lead.caller_phone}`} className="font-mono font-medium text-primary hover:underline">
              {lead.caller_phone}
            </a>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">Load #</span>
            <Popover open={isLoadEditOpen} onOpenChange={setIsLoadEditOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 font-mono font-semibold text-blue-600 hover:text-blue-800 group">
                  {attachedLoad ? attachedLoad.load_number : <span className="text-muted-foreground italic font-normal">Not set</span>}
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search load number..."
                      value={loadSearchQuery}
                      onChange={(e) => setLoadSearchQuery(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  
                  {isSearching && (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  
                  {searchResults && searchResults.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {searchResults.map((load) => (
                        <button
                          key={load.id}
                          onClick={() => updateLoadMutation.mutate(load.id)}
                          disabled={updateLoadMutation.isPending}
                          className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors text-sm"
                        >
                          <div className="font-mono font-semibold text-blue-600">{load.load_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {load.pickup_city}, {load.pickup_state} → {load.dest_city}, {load.dest_state}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {loadSearchQuery.length >= 2 && !isSearching && (!searchResults || searchResults.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-2">No loads found</p>
                  )}
                  
                  {attachedLoad && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateLoadMutation.mutate(null)}
                      disabled={updateLoadMutation.isPending}
                      className="w-full text-xs text-destructive hover:text-destructive"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Remove attached load
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">Company</span>
            <span className="font-medium">{lead.caller_company || "—"}</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">Intent Score</span>
            {lead.intent_score !== null ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="font-medium hover:text-primary transition-colors flex items-center gap-1 group">
                    {lead.intent_score}%
                    {lead.intent_reason_breakdown && (
                      <span className="text-xs text-muted-foreground group-hover:text-primary">
                        (details)
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">Intent Breakdown</span>
                      <Badge variant={lead.is_high_intent ? "default" : "secondary"} className="text-xs">
                        {lead.intent_score}%
                      </Badge>
                    </div>
                    {/* New keyword match format */}
                    {lead.intent_reason_breakdown && typeof lead.intent_reason_breakdown === 'object' && !Array.isArray(lead.intent_reason_breakdown) && (lead.intent_reason_breakdown as Record<string, unknown>).keyword_match && (
                      <div className="space-y-1 pt-1">
                        <Badge variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-800">
                          🔑 Keyword: {((lead.intent_reason_breakdown as Record<string, unknown>).keyword_match as Record<string, unknown>)?.keyword as string}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          Matched at {format(new Date(((lead.intent_reason_breakdown as Record<string, unknown>).keyword_match as Record<string, unknown>)?.matched_at as string || new Date()), "MMM d, h:mm a")}
                        </p>
                      </div>
                    )}
                    {/* Legacy array format */}
                    {Array.isArray(lead.intent_reason_breakdown) && lead.intent_reason_breakdown.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(lead.intent_reason_breakdown as string[]).map((reason, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs bg-primary/5">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    ) : !lead.intent_reason_breakdown && (
                      <p className="text-xs text-muted-foreground">No breakdown available</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="font-medium">—</span>
            )}
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">Created</span>
            <span className="font-medium">{format(new Date(lead.created_at), "MMM d, yyyy h:mm a")}</span>
          </div>
        </div>
        
        {/* Attached Load Details */}
        {attachedLoad && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-blue-900">Attached Load Details</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-0.5">Lane</span>
                <span className="font-medium text-blue-900">
                  {attachedLoad.pickup_city}, {attachedLoad.pickup_state} → {attachedLoad.dest_city}, {attachedLoad.dest_state}
                </span>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-0.5">Equipment</span>
                <span className="font-medium text-blue-900">
                  {attachedLoad.trailer_type || "—"}
                  {attachedLoad.trailer_footage && ` (${attachedLoad.trailer_footage} ft)`}
                </span>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-0.5">Ship Date</span>
                <span className="font-medium text-blue-900">
                  {attachedLoad.ship_date ? format(new Date(attachedLoad.ship_date), "MMM d, yyyy") : "—"}
                </span>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-0.5">Rate</span>
                <span className="font-medium text-blue-900">
                  {attachedLoad.rate_raw ? (
                    attachedLoad.is_per_ton 
                      ? `$${Number(attachedLoad.rate_raw).toLocaleString()}/ton` 
                      : `$${Number(attachedLoad.rate_raw).toLocaleString()}`
                  ) : "—"}
                </span>
              </div>
            </div>
            {/* Second row: Tarps, Weight, Miles, Commodity */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-0.5">Tarps</span>
                <span className="font-medium text-blue-900">
                  {attachedLoad.tarps || attachedLoad.tarp_required ? (
                    <>
                      {attachedLoad.tarps || "Required"}
                      {attachedLoad.tarp_size && ` (${attachedLoad.tarp_size})`}
                    </>
                  ) : "None"}
                </span>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-0.5">Weight</span>
                <span className="font-medium text-blue-900">
                  {attachedLoad.weight_lbs ? `${Number(attachedLoad.weight_lbs).toLocaleString()} lbs` : "—"}
                </span>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-0.5">Miles</span>
                <span className="font-medium text-blue-900">{attachedLoad.miles || "—"}</span>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-0.5">Commodity</span>
                <span className="font-medium text-blue-900">{attachedLoad.commodity || "—"}</span>
              </div>
            </div>
            {/* Third row: Financials */}
            {(attachedLoad.customer_invoice_total || attachedLoad.target_pay || attachedLoad.max_pay) && (
              <div className="pt-2 border-t border-blue-200/50">
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-2">Financials</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-blue-600/70 block">Invoice</span>
                    <span className="font-semibold text-blue-900">
                      {attachedLoad.customer_invoice_total 
                        ? `$${Number(attachedLoad.customer_invoice_total).toLocaleString()}` 
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-blue-600/70 block">Target Pay</span>
                    <span className="font-semibold text-blue-900">
                      {attachedLoad.target_pay 
                        ? `$${Number(attachedLoad.target_pay).toLocaleString()}` 
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-blue-600/70 block">Target Comm</span>
                    <span className="font-semibold text-emerald-700">
                      {attachedLoad.target_commission 
                        ? `$${Number(attachedLoad.target_commission).toLocaleString()}` 
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-blue-600/70 block">Max Pay</span>
                    <span className="font-medium text-blue-900">
                      {attachedLoad.max_pay 
                        ? `$${Number(attachedLoad.max_pay).toLocaleString()}` 
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {/* Load Call Script / Notes */}
            {attachedLoad.load_call_script && (
              <div className="pt-2 border-t border-blue-200/50">
                <span className="text-xs uppercase tracking-wide text-blue-600/70 block mb-1">Load Notes</span>
                <p className="text-sm text-blue-900 whitespace-pre-wrap">{attachedLoad.load_call_script}</p>
              </div>
            )}
          </div>
        )}
        
        {/* Existing notes preview (if not editing) */}
        {!isNotesOpen && (
          <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
            <span className="text-xs uppercase tracking-wide font-medium block mb-1">Notes</span>
            {/* Show rate info from attached load */}
            {attachedLoad && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2 text-foreground">
                <div>
                  <span className="text-xs text-muted-foreground">Rate:</span>{" "}
                  <span className="font-medium">
                    {attachedLoad.rate_raw 
                      ? (attachedLoad.is_per_ton 
                          ? `$${Number(attachedLoad.rate_raw).toLocaleString()}/ton` 
                          : `$${Number(attachedLoad.rate_raw).toLocaleString()}`)
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Target Pay:</span>{" "}
                  <span className="font-medium">
                    {attachedLoad.target_pay 
                      ? `$${Number(attachedLoad.target_pay).toLocaleString()}` 
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Max Pay:</span>{" "}
                  <span className="font-medium">
                    {attachedLoad.max_pay 
                      ? `$${Number(attachedLoad.max_pay).toLocaleString()}` 
                      : "N/A"}
                  </span>
                </div>
              </div>
            )}
            {!attachedLoad && <p className="text-muted-foreground">Rate offered: N/A</p>}
            {notes && <p className="line-clamp-2 mt-1">{notes}</p>}
          </div>
        )}
        
        {/* Footer with ID */}
        <div className="flex items-center justify-end pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            Lead ID: {lead.id.slice(0, 8)}...
          </span>
        </div>
      </div>

      <TranscriptViewerModal
        open={transcriptModal.open}
        onOpenChange={(open) => setTranscriptModal((prev) => ({ ...prev, open }))}
        transcript={transcriptModal.transcript}
        summary={transcriptModal.summary}
        summaryTitle={transcriptModal.summaryTitle}
        callInfo={transcriptModal.callInfo}
      />
    </>
  );
};
