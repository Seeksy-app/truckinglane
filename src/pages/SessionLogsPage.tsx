import { useQuery } from "@tanstack/react-query";
import { Navigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";

type SessionLogRow = Tables<"session_logs">;

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export default function SessionLogsPage() {
  const { user, loading: authLoading } = useAuth();
  const { role, agencyId } = useUserRole();
  const { impersonatedAgencyId, isImpersonating } = useImpersonation();
  const effectiveAgencyId = isImpersonating ? impersonatedAgencyId : agencyId;
  const isAdmin = role === "agency_admin" || role === "super_admin";

  const { data = [], isLoading } = useQuery({
    queryKey: ["session_logs_full", effectiveAgencyId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("session_logs")
        .select("*")
        .eq("agency_id", effectiveAgencyId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (rows ?? []) as SessionLogRow[];
    },
    enabled: !!user && isAdmin && !!effectiveAgencyId,
  });

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!effectiveAgencyId) {
    return <Navigate to="/platform" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl tl-page-gutter py-8 pb-16">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="gap-1.5">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Session logs</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Recent activity for your agency (newest first, up to 200 entries).
        </p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-muted-foreground">No session logs yet.</p>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {format(new Date(row.created_at), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>{row.user_display_name?.trim() || "—"}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell className="max-w-xs truncate">{row.note ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(row.duration_seconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
