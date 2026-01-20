import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ArrowLeft, UserPlus, CheckCircle, XCircle, Phone, Building2, User, 
  Sparkles, ChevronDown, AlertTriangle, Home, RefreshCw 
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type Lead = Tables<"leads">;
type LeadStatus = "pending" | "claimed" | "closed";

const statusStyles: Record<LeadStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  claimed: "bg-blue-100 text-blue-800",
  closed: "bg-emerald-100 text-emerald-800",
};

const TranscriptCollapsible = ({ transcript }: { transcript: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
          <span className="text-sm text-muted-foreground">View full transcript</span>
          <ChevronDown 
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} 
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-accordion-down">
        <div className="pt-3 border-t border-border">
          <p className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
            {transcript}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// Loading skeleton component
function LeadDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-10 w-32 mb-6" />
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Error state component
function LeadDetailError({ error, onBack }: { error: Error | null; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" onClick={onBack} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <Card className="p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Failed to load details
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            {error?.message || "An unexpected error occurred while fetching the lead."}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Not found state component  
function LeadNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" onClick={onBack} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <Card className="p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-muted">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Lead not found
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            This lead may have been deleted or you don't have permission to view it.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={() => window.location.href = "/dashboard"}>
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Permission denied component
function LeadPermissionDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" onClick={onBack} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card className="p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-amber-100">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Permission denied
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            You don't have permission to view this lead. Please sign in or contact your administrator.
          </p>
          <Button onClick={() => window.location.href = "/auth"}>
            Sign In
          </Button>
        </Card>
      </div>
    </div>
  );
}

function LeadDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debug logging (dev only)
  if (process.env.NODE_ENV === "development") {
    console.log("[LeadDetail] Route param id:", id);
    console.log("[LeadDetail] User:", user?.id);
  }

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  const { data: lead, isLoading, error, isError } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      console.log("[LeadDetail] Fetching lead:", id);
      
      const { data, error } = await supabase
        .from("leads")
        .select(`
          *,
          conversations:conversation_id (
            summary,
            transcript
          )
        `)
        .eq("id", id!)
        .maybeSingle();

      console.log("[LeadDetail] Fetch result:", { data: data?.id, error });

      if (error) {
        // Check for permission errors
        if (error.code === "PGRST116" || error.message.includes("permission")) {
          throw new Error("PERMISSION_DENIED");
        }
        throw error;
      }
      return data;
    },
    enabled: !!user && !!id,
    retry: (failureCount, error) => {
      // Don't retry permission errors
      if (error instanceof Error && error.message === "PERMISSION_DENIED") {
        return false;
      }
      return failureCount < 2;
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("leads")
        .update({
          status: "claimed" as LeadStatus,
          claimed_by: user?.id,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", id!)
        .eq("status", "pending");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead claimed successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to claim lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: LeadStatus) => {
      const updateData: Partial<Lead> = { status };

      if (status === "closed") {
        updateData.closed_at = new Date().toISOString();
      } else if (status === "pending") {
        updateData.claimed_by = null;
        updateData.claimed_at = null;
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", id!);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead status updated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Guard: Invalid ID
  if (!id || id === "undefined" || id === "null") {
    return <LeadNotFound onBack={handleBack} />;
  }

  // Auth loading
  if (authLoading) {
    return <LeadDetailSkeleton />;
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Data loading
  if (isLoading) {
    return <LeadDetailSkeleton />;
  }

  // Error handling
  if (isError) {
    if (error instanceof Error && error.message === "PERMISSION_DENIED") {
      return <LeadPermissionDenied onBack={handleBack} />;
    }
    return <LeadDetailError error={error instanceof Error ? error : null} onBack={handleBack} />;
  }

  // Not found
  if (!lead) {
    return <LeadNotFound onBack={handleBack} />;
  }

  const isPending = lead.status === "pending";
  const isClaimed = lead.status === "claimed";
  const isClaimedByMe = lead.claimed_by === user.id;
  const conversation = lead.conversations as { summary?: string; transcript?: string } | null;

  return (
    <div className="min-h-screen bg-background">
      {/* Debug banner (dev only) */}
      {process.env.NODE_ENV === "development" && (
        <div className="bg-amber-100 text-amber-800 px-4 py-2 text-xs font-mono">
          [DEBUG] Route ID: {id} | Lead ID: {lead.id} | Status: {lead.status}
        </div>
      )}
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-serif text-3xl font-medium text-foreground">
                {lead.caller_name || "Unknown Caller"}
              </h1>
              <p className="text-muted-foreground mt-1">
                Created {format(new Date(lead.created_at), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
            <Badge className={statusStyles[lead.status]}>
              {lead.status}
            </Badge>
          </div>

          {/* Actions */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3">
                {isPending && (
                  <Button
                    onClick={() => claimMutation.mutate()}
                    disabled={claimMutation.isPending}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Claim Lead
                  </Button>
                )}
                {isClaimed && isClaimedByMe && (
                  <>
                    <Button
                      onClick={() => updateStatusMutation.mutate("closed")}
                      disabled={updateStatusMutation.isPending}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark as Closed
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate("pending")}
                      disabled={updateStatusMutation.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Release Lead
                    </Button>
                  </>
                )}
                {lead.status === "closed" && (
                  <p className="text-muted-foreground text-sm">
                    Closed on {lead.closed_at ? format(new Date(lead.closed_at), "MMMM d, yyyy") : "—"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl">Lead Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Caller Name</p>
                    <p className="font-medium">{lead.caller_name || "Unknown"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone Number</p>
                    <p className="font-medium font-mono">{lead.caller_phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className="font-medium">{lead.caller_company || "—"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Intent Score</p>
                    <div className="flex items-center gap-2">
                      {lead.is_high_intent ? (
                        <Badge variant="outline" className="border-emerald-500 text-emerald-700">
                          High Intent
                        </Badge>
                      ) : lead.intent_score !== null ? (
                        <p className="font-medium">{lead.intent_score}%</p>
                      ) : (
                        <p className="text-muted-foreground">—</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {lead.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Notes</p>
                    <p className="text-foreground">{lead.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Conversation Summary */}
          {(conversation?.summary || conversation?.transcript) && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-xl">Conversation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {conversation?.summary && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Summary</p>
                    <p className="text-foreground whitespace-pre-wrap">{conversation.summary}</p>
                  </div>
                )}
                
                {conversation?.transcript && (
                  <TranscriptCollapsible transcript={conversation.transcript} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const LeadDetail = () => {
  return (
    <ErrorBoundary
      fallbackTitle="Failed to load lead details"
      fallbackMessage="We encountered an error while loading this page. Please try again."
    >
      <LeadDetailContent />
    </ErrorBoundary>
  );
};

export default LeadDetail;
