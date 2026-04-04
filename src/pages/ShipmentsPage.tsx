import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Navigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, Package, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SHIPMENT_STATUS_PILLS,
  shipmentStatusBadgeClass,
  shipmentStatusLabel,
  type ShipmentStatus,
} from "@/lib/shipmentConstants";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

type ShipmentRow = Tables<"shipments"> & {
  customers: { company_name: string } | null;
  shipment_stops: Tables<"shipment_stops">[];
};

function formatCityState(city: string | null, state: string | null): string {
  const c = city?.trim();
  const s = state?.trim();
  if (c && s) return `${c}, ${s}`;
  return c || s || "—";
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export default function ShipmentsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { role, agencyId, loading: roleLoading } = useUserRole();
  const { impersonatedAgencyId, isImpersonating } = useImpersonation();
  const effectiveAgencyId = isImpersonating ? impersonatedAgencyId : agencyId;

  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["shipments", effectiveAgencyId],
    queryFn: async () => {
      if (!effectiveAgencyId) return [];
      const { data, error } = await supabase
        .from("shipments")
        .select(
          `
          *,
          customers ( company_name ),
          shipment_stops ( * )
        `,
        )
        .eq("agency_id", effectiveAgencyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShipmentRow[];
    },
    enabled: !!user && !!effectiveAgencyId,
  });

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const pickup = r.shipment_stops?.find((s) => s.stop_type === "pickup");
        const delivery = r.shipment_stops?.find((s) => s.stop_type === "delivery");
        const hay = [
          r.pro_number,
          r.customers?.company_name,
          pickup?.city,
          pickup?.state,
          delivery?.city,
          delivery?.state,
          r.equipment_type,
          r.commodity,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [rows, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    const c: Record<ShipmentStatus | "all", number> = {
      all: rows.length,
      new: 0,
      dispatched: 0,
      in_transit: 0,
      delivered: 0,
      covered: 0,
    };
    for (const r of rows) {
      const s = r.status as ShipmentStatus;
      if (s in c && s !== "all") c[s] += 1;
    }
    return c;
  }, [rows]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!role) return <Navigate to="/access-denied" replace />;

  if (!effectiveAgencyId) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-screen-2xl mx-auto tl-page-gutter py-12 text-center text-muted-foreground">
          Select or join an agency to view shipments.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-background flex flex-col">
      <AppHeader />
      <div className="flex-1 max-w-screen-2xl w-full mx-auto tl-page-gutter py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#111827] dark:text-foreground tracking-tight flex items-center gap-2">
              <Package className="h-7 w-7 text-[#F97316]" />
              Shipments
            </h1>
            <p className="text-sm text-[#6B7280] dark:text-muted-foreground mt-1">
              TMS loads — dispatch, track, and settle in one place.
            </p>
          </div>
          <Button
            className="bg-[#F97316] hover:bg-[#ea580c] text-white shadow-sm shrink-0"
            onClick={() => navigate("/shipments/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Shipment
          </Button>
        </div>

        <div className="rounded-lg border border-[#E5E7EB] bg-white dark:bg-card dark:border-border shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="border-b border-[#E5E7EB] dark:border-border bg-white dark:bg-card px-4 py-4 space-y-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {SHIPMENT_STATUS_PILLS.map((pill) => {
                const active = statusFilter === pill.id;
                const n = counts[pill.id];
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setStatusFilter(pill.id)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "border-[#F97316] bg-[#F97316] text-white shadow-sm"
                        : "border-[#E5E7EB] bg-[#FAFAFA] text-[#374151] hover:border-[#D1D5DB] hover:bg-white dark:border-border dark:bg-muted/30 dark:text-foreground",
                    )}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={cn(
                        "tabular-nums text-xs font-semibold",
                        active ? "text-white/90" : "text-[#6B7280] dark:text-muted-foreground",
                      )}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Pro#, customer, city, equipment..."
                className="pl-10 h-11 bg-white border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] shadow-sm dark:bg-background"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                No shipments match your filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[#E5E7EB] bg-[#F9FAFB] hover:bg-[#F9FAFB] dark:border-border dark:bg-muted/40">
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Pro#
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Customer
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Pickup
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Delivery
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Equipment
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Cust. Rate
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Carr. Rate
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Profit
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-[#374151] dark:text-foreground/90">
                      Created
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const pickup = r.shipment_stops?.find((s) => s.stop_type === "pickup");
                    const delivery = r.shipment_stops?.find((s) => s.stop_type === "delivery");
                    const cust = Number(r.customer_lh_rate) || 0;
                    const carr = Number(r.carrier_lh_rate) || 0;
                    const profit = cust - carr;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer border-b border-[#E5E7EB] dark:border-border hover:bg-[#FAFAFA] dark:hover:bg-muted/30"
                        onClick={() => navigate(`/shipments/${r.id}`)}
                      >
                        <TableCell className="font-semibold tabular-nums text-[#111827] dark:text-foreground">
                          {r.pro_number}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                              shipmentStatusBadgeClass(r.status),
                            )}
                          >
                            {shipmentStatusLabel(r.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-[#374151] dark:text-foreground max-w-[140px] truncate">
                          {r.customers?.company_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-[#374151] dark:text-foreground whitespace-nowrap">
                          {formatCityState(pickup?.city ?? null, pickup?.state ?? null)}
                        </TableCell>
                        <TableCell className="text-sm text-[#374151] dark:text-foreground whitespace-nowrap">
                          {formatCityState(delivery?.city ?? null, delivery?.state ?? null)}
                        </TableCell>
                        <TableCell className="text-sm text-[#6B7280] dark:text-muted-foreground max-w-[120px] truncate">
                          {r.equipment_type ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {formatMoney(r.customer_lh_rate)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {formatMoney(r.carrier_lh_rate)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-sm font-semibold tabular-nums",
                            profit >= 0 ? "text-[#047857]" : "text-destructive",
                          )}
                        >
                          {cust || carr ? formatMoney(profit) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-[#6B7280] dark:text-muted-foreground whitespace-nowrap">
                          {format(new Date(r.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
