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
  formatLaneStateCity,
  LOADS_TABLE_DENSE_CLASS,
  LOADS_TABLE_TOOLBAR_CLASS,
} from "@/lib/loadTableDisplay";

type Load = Tables<"loads">;

type ToolbarSortOption = "none" | "template_type";

type LaneHeaderSort = { column: "pickup" | "delivery"; dir: "asc" | "desc" };

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
  const [toolbarSort, setToolbarSort] = useState<ToolbarSortOption>("none");
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
    } else if (toolbarSort === "template_type") {
      result = [...result].sort((a, b) => {
        const templateOrder: Record<string, number> = {
          vms_email: 1,
          adelphia_xlsx: 2,
          aljex_flat: 3,
          aljex_big500: 3,
          aljex_spot: 4,
          oldcastle_gsheet: 5,
          truckertools: 6,
        };
        const aOrder = templateOrder[a.template_type] || 99;
        const bOrder = templateOrder[b.template_type] || 99;
        return aOrder - bOrder;
      });
    }

    return result;
  }, [loadsExcludingArchived, clientFilter, pickupStateFilter, destStateFilter, toolbarSort, laneSort]);

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
    setToolbarSort("none");
    setLaneSort((prev) => {
      if (prev?.column !== column) {
        return { column, dir: "asc" };
      }
      return { column, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const statusStyles: Record<string, string> = {
    open: "bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,40%)] border-[hsl(25,95%,53%)]/30",
    claimed: "bg-[hsl(210,80%,50%)]/15 text-[hsl(210,80%,40%)] border-[hsl(210,80%,50%)]/30",
    booked: "bg-[hsl(145,63%,42%)]/15 text-[hsl(145,63%,32%)] border-[hsl(145,63%,42%)]/30",
    closed: "bg-muted text-muted-foreground border-border",
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

  // Helper to format rate display
  const formatRate = (load: Load): { display: string; isPerTon: boolean } => {
    // For per-ton loads - show "$X / ton" when rate exists
    if (load.is_per_ton) {
      if (load.rate_raw && load.rate_raw > 0) {
        return { display: `$${load.rate_raw.toLocaleString()}`, isPerTon: true };
      }
      // Only show TBD when rate is truly missing/blank
      return { display: "TBD", isPerTon: false };
    }
    
    // For flat rate loads
    if (load.customer_invoice_total && load.customer_invoice_total > 0) {
      return { display: `$${load.customer_invoice_total.toLocaleString()}`, isPerTon: false };
    }
    
    // Fallback to rate_raw if available
    if (load.rate_raw && load.rate_raw > 0) {
      return { display: `$${load.rate_raw.toLocaleString()}`, isPerTon: false };
    }
    
    // Only show TBD when no rate data exists at all
    return { display: "TBD", isPerTon: false };
  };

  const tableColSpan = enableOpenLoadActions ? 11 : 10;

  return (
    <>
    <div
      className={cn(
        "w-full rounded-lg border border-border bg-card overflow-hidden",
        enableOpenLoadActions && selectedCount > 0 && "pb-16",
      )}
    >
      {/* Sort & Filter Controls */}
      <div className={LOADS_TABLE_TOOLBAR_CLASS}>
        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Sort:</span>
          <Select
            value={toolbarSort}
            onValueChange={(v) => {
              setToolbarSort(v as ToolbarSortOption);
              setLaneSort(null);
            }}
          >
            <SelectTrigger className="w-[140px] h-7 text-xs bg-background">
              <SelectValue placeholder="No sorting" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="none">No sorting</SelectItem>
              <SelectItem value="template_type">Client</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Filter by Client */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Client:</span>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[100px] h-7 text-xs bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
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
            <SelectTrigger className="w-[92px] h-7 text-xs bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-popover max-h-[300px]">
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
            <SelectTrigger className="w-[92px] h-7 text-xs bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-popover max-h-[300px]">
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
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        {/* Filter count indicator */}
        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground">
            Showing {filteredAndSortedLoads.length} of {loadsExcludingArchived.length}
          </span>
        )}
      </div>

      <div className="w-full min-w-0 overflow-x-auto">
        <Table className={LOADS_TABLE_DENSE_CLASS}>
        <TableHeader>
          <TableRow className="bg-muted/50 border-b border-border">
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
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
              Ship Date
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
              <button
                type="button"
                onClick={() => handleLaneHeaderClick("pickup")}
                className="inline-flex w-full items-center justify-center gap-1 hover:text-foreground"
                aria-label="Sort by pickup state"
              >
                Pickup
                {laneSort?.column === "pickup" ? (
                  laneSort.dir === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )
                ) : null}
              </button>
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
              <button
                type="button"
                onClick={() => handleLaneHeaderClick("delivery")}
                className="inline-flex w-full items-center justify-center gap-1 hover:text-foreground"
                aria-label="Sort by delivery state"
              >
                Delivery
                {laneSort?.column === "delivery" ? (
                  laneSort.dir === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )
                ) : null}
              </button>
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
              Invoice
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
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
            const isPending = load.status === "open" && !load.booked_by;
            const aljexTemplateBadge = getAljexTemplateBadgeLabel(load.template_type);
            return (
              <Fragment key={load.id}>
                <TableRow
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${isPending ? "bg-[hsl(38,92%,50%)]/5" : ""}`}
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
                  <TableCell className="text-center tabular-nums text-sm sm:text-base">
                    {load.ship_date || "—"}
                  </TableCell>
                  <TableCell
                    className="text-center max-w-[min(14rem,28vw)] min-w-0 truncate text-sm sm:text-base"
                    title={formatLaneStateCity(load.pickup_state, load.pickup_city) ?? load.pickup_location_raw ?? undefined}
                  >
                    {formatLaneStateCity(load.pickup_state, load.pickup_city) ??
                      load.pickup_location_raw ??
                      "—"}
                  </TableCell>
                  <TableCell
                    className="text-center max-w-[min(14rem,28vw)] min-w-0 truncate text-sm sm:text-base"
                    title={formatLaneStateCity(load.dest_state, load.dest_city) ?? load.dest_location_raw ?? undefined}
                  >
                    {formatLaneStateCity(load.dest_state, load.dest_city) ??
                      load.dest_location_raw ??
                      "—"}
                  </TableCell>
                  <TableCell className="text-center font-medium tabular-nums text-sm sm:text-base">
                    {(() => {
                      const rate = formatRate(load);
                      return (
                        <>
                          {rate.display}
                          {rate.isPerTon && (
                            <span className="text-xs sm:text-sm text-muted-foreground ml-0.5">/ ton</span>
                          )}
                        </>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm sm:text-base">
                    {load.target_pay && load.target_pay > 0
                      ? `$${load.target_pay.toLocaleString()}`
                      : "TBD"}
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm sm:text-base">
                    <div className="flex justify-center">
                      <Badge
                        className={`${statusStyles[load.status] || statusStyles.open} text-xs sm:text-sm h-6 px-2`}
                      >
                        {load.status === "booked" ? "Booked" : load.status === "closed" ? "Closed" : load.status === "claimed" ? "Claimed" : "Open"}
                      </Badge>
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
                                  "h-8 px-2 text-xs sm:text-sm font-semibold shrink-0 cursor-pointer",
                                  isPosted
                                    ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white"
                                    : "border-amber-400/70 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
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
                    <TableCell colSpan={tableColSpan} className="p-0">
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