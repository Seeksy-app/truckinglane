import { useState, useMemo, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  ChevronRight,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  ExternalLink,
  Loader2,
  Archive,
  Upload,
} from "lucide-react";
import { format } from "date-fns";
import { LoadExpandedRow } from "./LoadExpandedRow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadDATExport, isExportableLoad } from "@/lib/datExport";
import { truckerToolsNoRateRaw } from "@/lib/truckerToolsLoads";
import { formatCityState, formatCurrency } from "@/components/loads/LoadNotes";
import { cn } from "@/lib/utils";
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
import {
  getAljexTemplateBadgeLabel,
  getLoadBoardClientPrimaryLabel,
} from "@/lib/aljexLoadBoard";
import {
  compareLoadsByStateThenCity,
  LOADS_TABLE_DENSE_CLASS,
  LOADS_TABLE_TOOLBAR_CLASS,
} from "@/lib/loadTableDisplay";

type Load = Tables<"loads">;

type LaneHeaderSort = { column: "pickup" | "delivery"; dir: "asc" | "desc" };

function collapsedRouteTitle(load: Load): string {
  const p = formatCityState(load.pickup_city, load.pickup_state);
  const d = formatCityState(load.dest_city, load.dest_state);
  return `${(p || "—").toUpperCase()} → ${(d || "—").toUpperCase()}`;
}

function collapsedMetaLine(load: Load): string {
  const w = load.weight_lbs != null ? `${Number(load.weight_lbs).toLocaleString()} lbs` : null;
  const parts = [load.ship_date?.trim() || null, load.trailer_type?.trim() || null, w].filter(Boolean);
  return parts.length ? parts.join(" • ") : "—";
}

function collapsedStatusLabel(load: Load): string {
  if (load.status === "closed" && load.close_reason === "covered") return "Covered";
  const labels: Record<string, string> = {
    open: "Open",
    claimed: "Claimed",
    booked: "Booked",
    closed: "Closed",
  };
  return labels[load.status] || load.status;
}

interface LoadsTableProps {
  loads: Load[];
  loading: boolean;
  isDemo?: boolean;
  onRefresh: () => void;
  /** Open Loads mode: selection, bulk DAT/archive, per-row DAT. */
  enableOpenLoadActions?: boolean;
}

const INITIAL_DISPLAY_COUNT = 25;

/** Source of truth for DAT posted state: valid timestamp from DB only (never infer green from stale client state). */
function hasValidDatPosted(datPostedAt: string | null | undefined): boolean {
  if (datPostedAt == null || String(datPostedAt).trim() === "") return false;
  const t = new Date(datPostedAt).getTime();
  return !Number.isNaN(t);
}

function formatDatPostedLine(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Posted to DAT";
  return `Posted to DAT · ${format(d, "MMM d, yyyy h:mm a")}`;
}

export function LoadsTable({
  loads,
  loading,
  isDemo = false,
  onRefresh,
  enableOpenLoadActions = false,
}: LoadsTableProps) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [laneSort, setLaneSort] = useState<LaneHeaderSort | null>(null);
  const [pickupStateFilter, setPickupStateFilter] = useState<string>("all");
  const [destStateFilter, setDestStateFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [datPostingId, setDatPostingId] = useState<string | null>(null);
  const [bulkDatBusy, setBulkDatBusy] = useState(false);
  /** Demo only: rows user "posted" locally (no DB). */
  const [demoDatPostedIds, setDemoDatPostedIds] = useState<Set<string>>(() => new Set());

  /** Matches dashboard query: no archived dispatch rows in table or Client counts. */
  const loadsExcludingArchived = useMemo(
    () => loads.filter((l) => l.dispatch_status !== "archived"),
    [loads],
  );

  const handleNavigateToDetail = (
    loadId: string,
    load?: Load,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    if (load && isDemo) {
      // For demo mode, pass the load data via state
      navigate(`/loads/${loadId}`, { state: { demoLoad: load } });
    } else {
      navigate(`/loads/${loadId}`);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Extract unique states and clients from loads for filter dropdowns
  const { pickupStates, destStates, clients, clientCounts } = useMemo(() => {
    const pickupSet = new Set<string>();
    const destSet = new Set<string>();
    const clientSet = new Set<string>();
    const countMap: Record<string, number> = {};
    
    loadsExcludingArchived.forEach((load) => {
      if (load.pickup_state?.trim()) pickupSet.add(load.pickup_state.trim().toUpperCase());
      if (load.dest_state?.trim()) destSet.add(load.dest_state.trim().toUpperCase());
      if (load.template_type) {
        clientSet.add(load.template_type);
        countMap[load.template_type] = (countMap[load.template_type] || 0) + 1;
      }
    });
    
    return {
      pickupStates: Array.from(pickupSet).sort(),
      destStates: Array.from(destSet).sort(),
      clients: Array.from(clientSet).sort((a, b) => {
        // Custom order: VMS first, then Adelphia, then Aljex
        const order: Record<string, number> = {
          vms_email: 1,
          adelphia_xlsx: 2,
          aljex_flat: 3,
          aljex_big500: 3,
          aljex_spot: 4,
          oldcastle_gsheet: 5,
          truckertools: 6,
        };
        return (order[a] || 99) - (order[b] || 99);
      }),
      clientCounts: countMap,
    };
  }, [loadsExcludingArchived]);

  // Apply filters then sort
  const filteredAndSortedLoads = useMemo(() => {
    let result = loadsExcludingArchived;
    
    // Apply client filter
    if (clientFilter !== "all") {
      result = result.filter((l) => l.template_type === clientFilter);
    }
    
    // Apply pickup state filter
    if (pickupStateFilter !== "all") {
      result = result.filter(
        (l) => l.pickup_state?.trim().toUpperCase() === pickupStateFilter
      );
    }
    
    // Apply dest state filter
    if (destStateFilter !== "all") {
      result = result.filter(
        (l) => l.dest_state?.trim().toUpperCase() === destStateFilter
      );
    }
    
    // Apply sorting: lane headers (state, then city) take precedence over toolbar
    if (laneSort) {
      result = [...result].sort((a, b) =>
        compareLoadsByStateThenCity(a, b, laneSort.column, laneSort.dir),
      );
    } else {
      result = [...result].sort((a, b) => {
        const templateOrder: Record<string, number> = {
          vms_email: 1,
          adelphia_xlsx: 2,
          aljex_flat: 3,
          aljex_big500: 3,
          aljex_spot: 4,
          oldcastle_gsheet: 5,
          semco_email: 5,
          semco_xlsx: 5,
          truckertools: 6,
        };
        const aOrder = templateOrder[a.template_type] || 99;
        const bOrder = templateOrder[b.template_type] || 99;
        return aOrder - bOrder;
      });
    }

    return result;
  }, [loadsExcludingArchived, clientFilter, pickupStateFilter, destStateFilter, laneSort]);

  const filteredIds = useMemo(
    () => filteredAndSortedLoads.map((l) => l.id),
    [filteredAndSortedLoads],
  );

  useEffect(() => {
    if (!enableOpenLoadActions) return;
    setSelectedIds((prev) => {
      const allowed = new Set(filteredIds);
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [enableOpenLoadActions, filteredIds]);

  const selectedInView = useMemo(() => {
    const set = selectedIds;
    return filteredAndSortedLoads.filter((l) => set.has(l.id));
  }, [filteredAndSortedLoads, selectedIds]);

  const selectedCount = selectedIds.size;
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id));

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleBulkPostToDat = () => {
    const exportable = selectedInView.filter(isExportableLoad);
    if (exportable.length === 0) {
      toast.error("No selected loads have complete destination for DAT export.");
      return;
    }
    setBulkDatBusy(true);
    try {
      const day = new Date().toISOString().split("T")[0];
      downloadDATExport(exportable, `DAT_Export_Selected_${day}.csv`);
      toast.success(`Exported ${exportable.length} load${exportable.length === 1 ? "" : "s"} to DAT CSV`);
      setSelectedIds(new Set());
    } finally {
      setBulkDatBusy(false);
    }
  };

  const handleArchiveSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (isDemo) {
      toast.message("Demo mode — no changes saved");
      setArchiveDialogOpen(false);
      setSelectedIds(new Set());
      return;
    }
    setArchiving(true);
    try {
      const { error } = await supabase
        .from("loads")
        .update({ dispatch_status: "archived", is_active: false })
        .in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} load${ids.length === 1 ? "" : "s"} archived`);
      setSelectedIds(new Set());
      setArchiveDialogOpen(false);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive loads");
    } finally {
      setArchiving(false);
    }
  };

  const handleRowPostToDat = async (load: Load, e: React.MouseEvent) => {
    e.stopPropagation();
    const serverPosted = (load as { dat_posted_at?: string | null }).dat_posted_at;
    const isPosted =
      hasValidDatPosted(serverPosted) || (isDemo && demoDatPostedIds.has(load.id));
    if (isPosted) return;

    if (!isExportableLoad(load)) {
      toast.error("Add pickup and destination city/state before posting to DAT.");
      return;
    }
    setDatPostingId(load.id);
    const nowIso = new Date().toISOString();
    try {
      const name = `DAT_Load_${(load.load_number || load.id).toString().replace(/[^\w.-]+/g, "_")}.csv`;
      downloadDATExport([load], name);
      if (isDemo) {
        setDemoDatPostedIds((prev) => new Set(prev).add(load.id));
        toast.success("DAT file downloaded (demo — not saved)");
        return;
      }
      const { error } = await supabase
        .from("loads")
        .update({ dat_posted_at: nowIso })
        .eq("id", load.id);
      if (error) throw error;
      toast.success("DAT downloaded and load marked posted");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update load");
    } finally {
      setDatPostingId(null);
    }
  };

  const hasActiveFilters = clientFilter !== "all" || pickupStateFilter !== "all" || destStateFilter !== "all";

  const clearFilters = () => {
    setClientFilter("all");
    setPickupStateFilter("all");
    setDestStateFilter("all");
  };

  const handleLaneHeaderClick = (column: "pickup" | "delivery") => {
    setLaneSort((prev) => {
      if (prev?.column !== column) {
        return { column, dir: "asc" };
      }
      return { column, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const collapsedStatusPillClass = (load: Load) => {
    if (load.status === "open") {
      return "rounded-full bg-[#F97316] px-2.5 py-0.5 text-xs font-semibold text-white border-0 shadow-none";
    }
    if (load.status === "claimed") {
      return "rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-xs font-semibold text-[#1E40AF] border border-[#BFDBFE]";
    }
    if (load.status === "booked") {
      return "rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-xs font-semibold text-[#047857] border border-[#A7F3D0]";
    }
    return "rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-semibold text-[#374151] border border-[#E5E7EB]";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (loadsExcludingArchived.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No loads found</p>
        <p className="text-sm">Import a CSV file to get started</p>
      </div>
    );
  }

  const tableColSpan = enableOpenLoadActions ? 8 : 7;

  return (
    <>
    <div
      className={cn(
        "w-full rounded-lg border border-[#E5E7EB] bg-white overflow-hidden",
        enableOpenLoadActions && selectedCount > 0 && "pb-16",
      )}
    >
      {/* Sort & Filter Controls */}
      <div className={cn(LOADS_TABLE_TOOLBAR_CLASS, "!bg-[#F9FAFB] border-[#E5E7EB]")}>
        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Sort:</span>
          <button
            type="button"
            onClick={() => setLaneSort(null)}
            className={cn(
              "h-9 inline-flex min-w-[5.5rem] shrink-0 items-center rounded-md border border-border bg-background px-3 text-sm sm:text-base transition-colors hover:bg-muted/60",
              laneSort != null && "ring-1 ring-primary/35",
            )}
            title={
              laneSort != null
                ? "Switch back to client order"
                : "Sorted by client (use Pickup / Delivery headers to sort by lane)"
            }
          >
            Client
          </button>
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Filter by Client */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Client:</span>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-9 min-w-[14rem] w-[min(100%,18rem)] max-w-[20rem] text-sm sm:text-base bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-popover min-w-[var(--radix-select-trigger-width)]">
              <SelectItem value="all">All ({loadsExcludingArchived.length})</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client} value={client}>
                  {getLoadBoardClientPrimaryLabel(client)}
                  {client === "aljex_big500" ? " (Big 500)" : ""} ({clientCounts[client] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filter by Pickup State */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Pickup:</span>
          <Select value={pickupStateFilter} onValueChange={setPickupStateFilter}>
            <SelectTrigger className="h-9 min-w-[8rem] w-[min(100%,11rem)] max-w-[13rem] text-sm sm:text-base bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-popover max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
              <SelectItem value="all">All States</SelectItem>
              {pickupStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filter by Delivery State */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Delivery:</span>
          <Select value={destStateFilter} onValueChange={setDestStateFilter}>
            <SelectTrigger className="h-9 min-w-[8rem] w-[min(100%,11rem)] max-w-[13rem] text-sm sm:text-base bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-popover max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
              <SelectItem value="all">All States</SelectItem>
              {destStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 px-2 text-sm sm:text-base text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        {/* Filter count indicator */}
        {hasActiveFilters && (
          <span className="text-sm sm:text-base text-muted-foreground">
            Showing {filteredAndSortedLoads.length} of {loadsExcludingArchived.length}
          </span>
        )}
      </div>

      <div className="w-full min-w-0 overflow-x-auto">
        <Table
          className={cn(
            LOADS_TABLE_DENSE_CLASS,
            "[&_td.loads-route-cell]:!text-left [&_td.loads-route-cell]:align-middle [&_td.loads-route-cell]:!whitespace-normal",
            "[&_td.loads-target-cell]:!text-right",
          )}
        >
        <TableHeader>
          <TableRow className="bg-[#F9FAFB] border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
            {enableOpenLoadActions && (
              <TableHead className="w-8 px-0.5 text-center align-middle">
                <Checkbox
                  disabled={filteredIds.length === 0}
                  checked={
                    filteredIds.length === 0
                      ? false
                      : allFilteredSelected
                        ? true
                        : someFilteredSelected
                          ? "indeterminate"
                          : false
                  }
                  onCheckedChange={(v) => handleSelectAllFiltered(v === true)}
                  aria-label="Select all visible loads"
                />
              </TableHead>
            )}
            <TableHead className="w-8 px-0.5 text-center align-middle" />
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
              Load #
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
              Client
            </TableHead>
            <TableHead className="!text-left align-middle min-w-[12rem] max-w-[min(42rem,55vw)] pl-3">
              <div className="flex flex-col items-start gap-1.5">
                <span className="text-[10px] uppercase tracking-wide font-medium text-[#6B7280]">
                  Route
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleLaneHeaderClick("pickup")}
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[10px] font-medium transition-colors",
                      laneSort?.column === "pickup" ? "text-[#111827]" : "text-[#6B7280] hover:text-[#111827]",
                    )}
                    aria-label="Sort by pickup lane"
                  >
                    Pickup
                    {laneSort?.column === "pickup" ? (
                      laneSort.dir === "asc" ? (
                        <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
                      )
                    ) : null}
                  </button>
                  <span className="text-[#D1D5DB]" aria-hidden>
                    |
                  </span>
                  <button
                    type="button"
                    onClick={() => handleLaneHeaderClick("delivery")}
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[10px] font-medium transition-colors",
                      laneSort?.column === "delivery" ? "text-[#111827]" : "text-[#6B7280] hover:text-[#111827]",
                    )}
                    aria-label="Sort by delivery lane"
                  >
                    Delivery
                    {laneSort?.column === "delivery" ? (
                      laneSort.dir === "asc" ? (
                        <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
                      )
                    ) : null}
                  </button>
                </div>
              </div>
            </TableHead>
            <TableHead className="!text-right text-[10px] uppercase tracking-wide font-medium text-[#6B7280] pr-3">
              Target Pay
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
              Status
            </TableHead>
            <TableHead
              className={
                enableOpenLoadActions
                  ? "w-[88px] text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center"
                  : "w-14 text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center"
              }
            >
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredAndSortedLoads.slice(0, displayCount).map((load) => {
            const aljexTemplateBadge = getAljexTemplateBadgeLabel(load.template_type);
            const targetCollapsed =
              truckerToolsNoRateRaw(load) || load.target_pay == null || load.target_pay <= 0
                ? "TBD"
                : formatCurrency(load, load.target_pay) ?? "TBD";
            return (
              <Fragment key={load.id}>
                <TableRow
                  className={cn(
                    "cursor-pointer border-b border-[#E5E7EB] bg-white transition-shadow transition-colors",
                    "hover:shadow-[0_2px_10px_rgba(0,0,0,0.07)] hover:bg-white",
                  )}
                  onClick={() => toggleExpand(load.id)}
                >
                  {enableOpenLoadActions && (
                    <TableCell
                      className="w-8 px-0.5 text-center align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.has(load.id)}
                        onCheckedChange={() => toggleSelectOne(load.id)}
                        aria-label={`Select load ${load.load_number || load.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="w-8 px-0.5 text-center align-middle text-sm sm:text-base">
                    <span className="inline-flex justify-center">
                      {expandedId === load.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-center font-medium tabular-nums text-sm sm:text-base">
                    {load.load_number || "—"}
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm sm:text-base">
                    <div className="flex flex-nowrap items-center justify-center gap-0.5 min-w-0">
                      <Badge variant="outline" className="text-xs sm:text-sm font-medium h-6 px-1.5 shrink-0">
                        {getLoadBoardClientPrimaryLabel(load.template_type)}
                      </Badge>
                      {aljexTemplateBadge ? (
                        <Badge
                          variant="secondary"
                          className="h-6 px-1.5 py-0 text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0"
                        >
                          {aljexTemplateBadge}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="loads-route-cell py-3 pl-3 pr-2 text-sm sm:text-base">
                    <div className="flex flex-col gap-1 min-w-0 text-left">
                      <div className="font-bold text-[#1A1A1A] leading-snug">
                        {collapsedRouteTitle(load)}
                      </div>
                      <div className="text-xs sm:text-sm text-[#6B7280] leading-snug">
                        {collapsedMetaLine(load)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="loads-target-cell py-3 pl-2 pr-3 align-middle">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-lg sm:text-xl font-bold tabular-nums text-[#111827]">
                        {targetCollapsed}
                      </span>
                      {load.is_per_ton ? (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-[#6B7280]">
                          Per-ton
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm sm:text-base">
                    <div className="flex justify-center">
                      <span className={collapsedStatusPillClass(load)}>{collapsedStatusLabel(load)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm sm:text-base" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5 justify-center">
                      {enableOpenLoadActions && (() => {
                        const serverPosted = (load as { dat_posted_at?: string | null }).dat_posted_at;
                        const isPosted =
                          hasValidDatPosted(serverPosted) ||
                          (isDemo && demoDatPostedIds.has(load.id));
                        const postedIso =
                          hasValidDatPosted(serverPosted) ? String(serverPosted) : null;
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "h-8 px-2 text-xs sm:text-sm font-semibold shrink-0 cursor-pointer shadow-none",
                                  isPosted
                                    ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white"
                                    : "border-[#1F2937] bg-[#1F2937] text-white hover:bg-[#111827] hover:text-white",
                                )}
                                disabled={datPostingId === load.id}
                                onClick={(e) => handleRowPostToDat(load, e)}
                              >
                                {datPostingId === load.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isPosted ? (
                                  "DAT ✓"
                                ) : (
                                  "DAT"
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isPosted
                                ? postedIso
                                  ? formatDatPostedLine(postedIso)
                                  : "Posted to DAT (demo)"
                                : "Not posted to DAT yet"}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleNavigateToDetail(load.id, load, e)}
                            className="h-8 w-8 p-0"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Details</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === load.id && (
                  <TableRow>
                    <TableCell colSpan={tableColSpan} className="!p-0">
                      <LoadExpandedRow
                        load={load}
                        isDemo={isDemo}
                        onStatusChange={onRefresh}
                        enableOpenLoadActions={enableOpenLoadActions}
                        onPostToDat={
                          enableOpenLoadActions
                            ? (e) => handleRowPostToDat(load, e)
                            : undefined
                        }
                        onOpenDetail={
                          enableOpenLoadActions
                            ? (e) => handleNavigateToDetail(load.id, load, e)
                            : undefined
                        }
                        datPostingId={datPostingId}
                        demoDatPostedIds={demoDatPostedIds}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      </div>

      {/* Load More / Show All */}
      {filteredAndSortedLoads.length > displayCount && (
        <div className="flex items-center justify-center gap-3 py-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDisplayCount((prev) => prev + 25)}
          >
            Load More ({filteredAndSortedLoads.length - displayCount} remaining)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDisplayCount(filteredAndSortedLoads.length)}
          >
            Show All ({filteredAndSortedLoads.length})
          </Button>
        </div>
      )}
    </div>

    {enableOpenLoadActions && selectedCount > 0 && (
      <div
        className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg"
        role="toolbar"
        aria-label="Bulk load actions"
      >
        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{selectedCount}</span> load
          {selectedCount === 1 ? "" : "s"} selected
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            disabled={bulkDatBusy}
            onClick={handleBulkPostToDat}
          >
            {bulkDatBusy ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Post to DAT
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/80 bg-amber-500/10 text-amber-950 hover:bg-amber-500/20 dark:text-amber-100"
            onClick={() => setArchiveDialogOpen(true)}
          >
            <Archive className="h-4 w-4 mr-1" />
            Archive
          </Button>
        </div>
      </div>
    )}

    <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive loads?</AlertDialogTitle>
          <AlertDialogDescription>
            Archive {selectedCount} load{selectedCount === 1 ? "" : "s"}? They will be hidden from the
            dashboard.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
          <Button
            variant="outline"
            className="border-amber-600 bg-amber-600 text-white hover:bg-amber-700 hover:text-white"
            disabled={archiving}
            onClick={() => void handleArchiveSelected()}
          >
            {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Archive"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}