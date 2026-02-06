import { useParams, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, Package, MapPin, Calendar, DollarSign, Truck, 
  Scale, Ruler, AlertTriangle, Home, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type Load = Tables<"loads">;
type LoadStatus = "open" | "claimed" | "booked" | "closed";

const statusStyles: Record<LoadStatus, string> = {
  open: "bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,40%)] border-[hsl(25,95%,53%)]/30",
  claimed: "bg-[hsl(210,80%,50%)]/15 text-[hsl(210,80%,40%)] border-[hsl(210,80%,50%)]/30",
  booked: "bg-[hsl(145,63%,42%)]/15 text-[hsl(145,63%,32%)] border-[hsl(145,63%,42%)]/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const statusLabels: Record<LoadStatus, string> = {
  open: "Open",
  claimed: "Claimed",
  booked: "Booked",
  closed: "Closed",
};

// Loading skeleton component
function LoadDetailSkeleton() {
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
function LoadDetailError({ error, onBack }: { error: Error | null; onBack: () => void }) {
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
            {error?.message || "An unexpected error occurred while fetching the load."}
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
function LoadNotFound({ onBack }: { onBack: () => void }) {
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
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Load not found
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            This load may have been deleted or you don't have permission to view it.
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
function LoadPermissionDenied({ onBack }: { onBack: () => void }) {
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
            You don't have permission to view this load. Please sign in or contact your administrator.
          </p>
          <Button onClick={() => window.location.href = "/auth"}>
            Sign In
          </Button>
        </Card>
      </div>
    </div>
  );
}

function LoadDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const demoLoad = (location.state as any)?.demoLoad as Load | undefined;

  // Debug logging (dev only)
  if (process.env.NODE_ENV === "development") {
    console.log("[LoadDetail] Route param id:", id);
    console.log("[LoadDetail] User:", user?.id);
  }

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  const { data: load, isLoading, error, isError } = useQuery({
    queryKey: ["load", id],
    queryFn: async () => {
      if (demoLoad) {
        console.log("[LoadDetail] Using demo load:", demoLoad.id);
        return demoLoad;
      }

      console.log("[LoadDetail] Fetching load:", id);
      
      const { data, error } = await supabase
        .from("loads")
        .select("*")
        .eq("id", id!)
        .maybeSingle();

      console.log("[LoadDetail] Fetch result:", { data: data?.id, error });

      if (error) {
        // Check for permission errors
        if (error.code === "PGRST116" || error.message.includes("permission")) {
          throw new Error("PERMISSION_DENIED");
        }
        throw error;
      }
      
      return data;
    },
    enabled: !!id && (!!user || !!demoLoad),
    retry: (failureCount, error) => {
      // Don't retry permission errors
      if (error instanceof Error && error.message === "PERMISSION_DENIED") {
        return false;
      }
      return failureCount < 2;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: LoadStatus) => {
      const updateData: Partial<Load> = { status };

      if (status === "booked") {
        updateData.booked_at = new Date().toISOString();
        updateData.booked_by = user?.id;
      } else if (status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("loads")
        .update(updateData)
        .eq("id", id!);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", id] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      toast({ title: "Load status updated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update load",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Guard: Invalid ID
  if (!id || id === "undefined" || id === "null") {
    return <LoadNotFound onBack={handleBack} />;
  }

  // Auth loading
  if (authLoading) {
    return <LoadDetailSkeleton />;
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Data loading
  if (isLoading) {
    return <LoadDetailSkeleton />;
  }

  // Error handling
  if (isError) {
    if (error instanceof Error && error.message === "PERMISSION_DENIED") {
      return <LoadPermissionDenied onBack={handleBack} />;
    }
    return <LoadDetailError error={error instanceof Error ? error : null} onBack={handleBack} />;
  }

  // Not found
  if (!load) {
    return <LoadNotFound onBack={handleBack} />;
  }

  const status = (load.status || "open") as LoadStatus;

  // Format rate display
  const formatRate = () => {
    if (load.is_per_ton && load.rate_raw && load.rate_raw > 0) {
      return `$${load.rate_raw.toLocaleString()} / ton`;
    }
    if (load.customer_invoice_total && load.customer_invoice_total > 0) {
      return `$${load.customer_invoice_total.toLocaleString()}`;
    }
    return "TBD";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Debug banner (dev only) */}
      {process.env.NODE_ENV === "development" && (
        <div className="bg-amber-100 text-amber-800 px-4 py-2 text-xs font-mono">
          [DEBUG] Route ID: {id} | Load ID: {load.id} | Status: {status}
        </div>
      )}
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-serif text-3xl font-medium text-foreground flex items-center gap-3">
                <Package className="h-8 w-8 text-primary" />
                Load #{load.load_number || "—"}
              </h1>
              <p className="text-muted-foreground mt-1">
                Created {format(new Date(load.created_at), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
            <Badge className={statusStyles[status]}>
              {statusLabels[status]}
            </Badge>
          </div>

          {/* Actions */}
          {!demoLoad && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3">
                {status === "open" && (
                  <Button
                    onClick={() => updateStatusMutation.mutate("claimed")}
                    disabled={updateStatusMutation.isPending}
                  >
                    Claim Load
                  </Button>
                )}
                {status === "claimed" && (
                  <>
                    <Button
                      onClick={() => updateStatusMutation.mutate("booked")}
                      disabled={updateStatusMutation.isPending}
                    >
                      Book Load
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate("open")}
                      disabled={updateStatusMutation.isPending}
                    >
                      Release
                    </Button>
                  </>
                )}
                {(status === "booked" || status === "closed") && (
                  <Button
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate("open")}
                    disabled={updateStatusMutation.isPending}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Route Details */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl flex items-center gap-2">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                Route Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground font-medium">Pickup</p>
                  <p className="text-foreground">
                    {load.pickup_city && load.pickup_state
                      ? `${load.pickup_city}, ${load.pickup_state}`
                      : load.pickup_location_raw || "—"}
                  </p>
                  {load.pickup_zip && (
                    <p className="text-xs text-muted-foreground">{load.pickup_zip}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground font-medium">Delivery</p>
                  <p className="text-foreground">
                    {load.dest_city && load.dest_state
                      ? `${load.dest_city}, ${load.dest_state}`
                      : load.dest_location_raw || "—"}
                  </p>
                  {load.dest_zip && (
                    <p className="text-xs text-muted-foreground">{load.dest_zip}</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Ship Date</p>
                    <p className="text-sm font-medium">{load.ship_date || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Delivery Date</p>
                    <p className="text-sm font-medium">{load.delivery_date || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Miles</p>
                    <p className="text-sm font-medium">{load.miles || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Trailer</p>
                    <p className="text-sm font-medium">{load.trailer_type || "—"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial Details */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                Financial Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice</p>
                  <p className="text-lg font-semibold">{formatRate()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Target Pay</p>
                  <p className="text-lg font-semibold">
                    {load.target_pay ? `$${load.target_pay.toLocaleString()}` : "TBD"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Max Pay</p>
                  <p className="text-lg font-semibold">
                    {load.max_pay ? `$${load.max_pay.toLocaleString()}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Target Commission</p>
                  <p className="text-lg font-semibold">
                    {load.target_commission ? `$${load.target_commission.toLocaleString()}` : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Load Details */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl flex items-center gap-2">
                <Scale className="h-5 w-5 text-muted-foreground" />
                Load Specifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="font-medium">
                    {load.weight_lbs ? `${load.weight_lbs.toLocaleString()} lbs` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Commodity</p>
                  <p className="font-medium">{load.commodity || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Trailer Footage</p>
                  <p className="font-medium">
                    {load.trailer_footage ? `${load.trailer_footage} ft` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tarps</p>
                  <p className="font-medium">
                    {load.tarp_required ? `Yes (${load.tarp_size || load.tarps || "Standard"})` : "No"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Call Script */}
          {load.load_call_script && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-xl">Call Script</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                  {load.load_call_script}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const LoadDetail = () => {
  return (
    <ErrorBoundary
      fallbackTitle="Failed to load details"
      fallbackMessage="We encountered an error while loading this page. Please try again."
    >
      <LoadDetailContent />
    </ErrorBoundary>
  );
};

export default LoadDetail;
