import { useState, useMemo, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import {
  buildDatExportArtifact,
  formatDatExportDownloadMessage,
  getDatExportUserDisplayName,
  isExportableLoad,
  markDATExportComplete,
  stampDatExportAndLog,
  triggerDatExportBlobDownload,
} from "@/lib/datExport";
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
import { compareLoadsByStateThenCity, LOADS_TABLE_DENSE_CLASS } from "@/lib/loadTableDisplay";
import { CLIENT_SOURCE_PILLS, countLoadsForPill } from "@/lib/loadBoardSourcePills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

export type ExternalLaneFilters = {
  pickupState: string;
  destState: string;
  setPickupState: (v: string) => void;
  setDestState: (v: string) => void;
};

export type ControlledSourceFilter = {
  value: string;
  onChange: (id: string) => void;
};

interface LoadsTableProps {
  loads: Load[];
  loading: boolean;
  isDemo?: boolean;
  onRefresh: () => void;
  /** Open Loads mode: selection, bulk DAT/archive, per-row DAT. */
  enableOpenLoadActions?: boolean;
  /** When set, pickup/delivery state filters are controlled by the parent (e.g. dashboard search row). */
  externalLaneFilters?: ExternalLaneFilters;
  /** When set, source pills are rendered by the parent; filtering uses this value. */
  controlledSourceFilter?: ControlledSourceFilter;
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
  externalLaneFilters,
  controlledSourceFilter,
}: LoadsTableProps) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [laneSort, setLaneSort] = useState<LaneHeaderSort | null>(null);
  const [internalPickupStateFilter, setInternalPickupStateFilter] = useState<string>("all");
  const [internalDestStateFilter, setInternalDestStateFilter] = useState<string>("all");
  const pickupStateFilter = externalLaneFilters?.pickupState ?? internalPickupStateFilter;
  const destStateFilter = externalLaneFilters?.destState ?? internalDestStateFilter;
  const setPickupStateFilter = externalLaneFilters?.setPickupState ?? setInternalPickupStateFilter;
  const setDestStateFilter = externalLaneFilters?.setDestState ?? setInternalDestStateFilter;
  const [internalClientFilter, setInternalClientFilter] = useState<string>("all");
  const clientFilter = controlledSourceFilter?.value ?? internalClientFilter;
  const setClientFilter = (id: string) => {
    if (controlledSourceFilter) controlledSourceFilter.onChange(id);
    else setInternalClientFilter(id);
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [datPostingId, setDatPostingId] = useState<string | null>(null);
  const [bulkDatBusy, setBulkDatBusy] = useState(false);
  /** Demo only: rows user "posted" locally (no DB). */
  const [demoDatPostedIds, setDemoDatPostedIds] = useState<Set<string>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { agencyId } = useUserRole();
  const { isImpersonating, impersonatedAgencyId } = useImpersonation();
  const effectiveAgencyId = isImpersonating ? impersonatedAgencyId : agencyId;

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

  // Pickup / delivery state options for advanced filters
  const { pickupStates, destStates } = useMemo(() => {
    const pickupSet = new Set<string>();
    const destSet = new Set<string>();
    loadsExcludingArchived.forEach((load) => {
      if (load.pickup_state?.trim()) pickupSet.add(load.pickup_state.trim().toUpperCase());
      if (load.dest_state?.trim()) destSet.add(load.dest_state.trim().toUpperCase());
    });
    return {
      pickupStates: Array.from(pickupSet).sort(),
      destStates: Array.from(destSet).sort(),
    };
  }, [loadsExcludingArchived]);

  // Apply filters then sort
  const filteredAndSortedLoads = useMemo(() => {
    let result = loadsExcludingArchived;
    
    // Apply client (source) filter
    if (clientFilter !== "all") {
      const pill = CLIENT_SOURCE_PILLS.find((p) => p.id === clientFilter);
      if (pill?.types?.length) {
        const set = new Set(pill.types);
        result = result.filter((l) => l.template_type != null && set.has(l.template_type));
      }
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

  const handleBulkPostToDat = async () => {
    const exportable = selectedInView.filter(isExportableLoad);
    if (exportable.length === 0) {
      toast.error("No selected loads have complete destination for DAT export.");
      return;
    }
    if (!effectiveAgencyId) {
      toast.error("No agency — cannot export");
      return;
    }
    setBulkDatBusy(true);
    try {
      const day = new Date().toISOString().split("T")[0];
      const artifact = await buildDatExportArtifact(
        exportable,
        `DAT_Export_Selected_${day}.csv`,
      );
      const { error } = await stampDatExportAndLog(
        supabase,
        effectiveAgencyId,
        exportable.map((l) => l.id),
        getDatExportUserDisplayName(user),
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      triggerDatExportBlobDownload(artifact.blob, artifact.downloadName);
      markDATExportComplete();
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["dat-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dat-pending-nav-badge"] });
      queryClient.invalidateQueries({ queryKey: ["dat-pending-counts-by-source"] });
      queryClient.invalidateQueries({ queryKey: ["dat-all-active-open-count"] });
      queryClient.invalidateQueries({ queryKey: ["load_activity_logs"] });
      queryClient.invalidateQueries({ queryKey: ["session_logs_full", effectiveAgencyId] });
      toast.success(formatDatExportDownloadMessage(artifact.totalRows, artifact.fileCount));
      setSelectedIds(new Set());
      onRefresh();
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
    try {
      const name = `DAT_Load_${(load.load_number || load.id).toString().replace(/[^\w.-]+/g, "_")}.csv`;
      const artifact = await buildDatExportArtifact([load], name);
      if (isDemo) {
        triggerDatExportBlobDownload(artifact.blob, artifact.downloadName);
        setDemoDatPostedIds((prev) => new Set(prev).add(load.id));
        toast.success("DAT file downloaded (demo — not saved)");
        return;
      }
      if (!effectiveAgencyId) {
        toast.error("No agency — cannot export");
        return;
      }
      const { error } = await stampDatExportAndLog(
        supabase,
        effectiveAgencyId,
        [load.id],
        getDatExportUserDisplayName(user),
      );
      if (error) throw error;
      triggerDatExportBlobDownload(artifact.blob, artifact.downloadName);
      markDATExportComplete();
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["dat-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dat-pending-nav-badge"] });
      queryClient.invalidateQueries({ queryKey: ["dat-pending-counts-by-source"] });
      queryClient.invalidateQueries({ queryKey: ["dat-all-active-open-count"] });
      queryClient.invalidateQueries({ queryKey: ["load_activity_logs"] });
      queryClient.invalidateQueries({ queryKey: ["session_logs_full", effectiveAgencyId] });
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

  const showPillsInTable = !controlledSourceFilter;
  const showFiltersInTable = !externalLaneFilters;
  const showLoadsToolbarTopRow = showPillsInTable || showFiltersInTable;

  return (
    <>
    <div
      className={cn(
        "w-full rounded-lg border border-[#E5E7EB] bg-white overflow-hidden",
        enableOpenLoadActions && selectedCount > 0 && "pb-16",
      )}
    >
      {/* Source pills + advanced lane filters (omitted when controlled by dashboard) */}
      {(showLoadsToolbarTopRow || hasActiveFilters) && (
        <div className="space-y-3 border-b border-[#E5E7EB] bg-white px-4 py-4">
          {showLoadsToolbarTopRow && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              {showPillsInTable && (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {CLIENT_SOURCE_PILLS.map((pill) => {
                    const n = countLoadsForPill(loadsExcludingArchived, pill.types);
                    const active = clientFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setClientFilter(pill.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                          active
                            ? "border-[#F97316] bg-[#F97316] text-white shadow-sm"
                            : "border-[#E5E7EB] bg-[#FAFAFA] text-[#374151] hover:border-[#D1D5DB] hover:bg-white",
                        )}
                      >
                        <span>{pill.label}</span>
                        <span
                          className={cn(
                            "tabular-nums text-xs font-semibold",
                            active ? "text-white/90" : "text-[#6B7280]",
                          )}
                        >
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {showFiltersInTable && (
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 shrink-0 gap-2 border-[#E5E7EB] bg-white text-[#374151] shadow-sm",
                        (pickupStateFilter !== "all" || destStateFilter !== "all") && "border-[#F97316]/50",
                      )}
                    >
                      <Filter className="h-4 w-4" />
                      Filters
                      {(pickupStateFilter !== "all" || destStateFilter !== "all") && (
                        <span className="h-2 w-2 rounded-full bg-[#F97316]" aria-hidden />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 space-y-4" align="end">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pickup state</p>
                      <Select value={pickupStateFilter} onValueChange={setPickupStateFilter}>
                        <SelectTrigger className="h-10 w-full bg-background">
                          <SelectValue placeholder="All states" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover max-h-[280px]">
                          <SelectItem value="all">All states</SelectItem>
                          {pickupStates.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery state</p>
                      <Select value={destStateFilter} onValueChange={setDestStateFilter}>
                        <SelectTrigger className="h-10 w-full bg-background">
                          <SelectValue placeholder="All states" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover max-h-[280px]">
                          <SelectItem value="all">All states</SelectItem>
                          {destStates.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-border pt-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => {
                          setPickupStateFilter("all");
                          setDestStateFilter("all");
                        }}
                      >
                        Reset lane filters
                      </Button>
                      <Button type="button" size="sm" onClick={() => setFiltersOpen(false)}>
                        Done
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#6B7280]">
              <span>
                Showing {filteredAndSortedLoads.length} of {loadsExcludingArchived.length} loads
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[#F97316] hover:text-[#ea580c]"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear filters
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="w-full min-w-0 overflow-x-auto">
        <Table
          className={cn(
            LOADS_TABLE_DENSE_CLASS,
            "[&_th.loads-route-head]:!text-left [&_th.loads-route-head]:align-middle",
            "[&_td.loads-route-cell]:!text-left [&_td.loads-route-cell]:align-middle [&_td.loads-route-cell]:!whitespace-normal",
            "[&_td.loads-target-cell]:!text-right",
          )}
        >
        <TableHeader>
          <TableRow className="border-b border-solid border-[#E5E7EB] bg-[#F9FAFB] hover:bg-[#F9FAFB] dark:border-border dark:bg-muted/40">
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
            <TableHead className="text-left align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Load #
            </TableHead>
            <TableHead className="text-center align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Client
            </TableHead>
            <TableHead className="loads-route-head min-w-[12rem] max-w-[min(42rem,55vw)] !whitespace-normal text-left align-middle pl-3">
              <div className="text-left">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
                  Route
                </div>
                <div className="mt-0.5 text-left text-[10px] font-medium leading-tight text-[#6B7280] sm:text-[11px] dark:text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleLaneHeaderClick("pickup")}
                    className={cn(
                      "rounded-sm align-middle transition-colors hover:text-[#374151] dark:hover:text-foreground",
                      laneSort?.column === "pickup"
                        ? "font-semibold text-[#374151] dark:text-foreground"
                        : "",
                    )}
                    aria-label="Sort by pickup lane"
                  >
                    Pickup
                    {laneSort?.column === "pickup" ? (
                      laneSort.dir === "asc" ? (
                        <ArrowUp className="ml-0.5 inline-block h-3 w-3 align-middle" aria-hidden />
                      ) : (
                        <ArrowDown className="ml-0.5 inline-block h-3 w-3 align-middle" aria-hidden />
                      )
                    ) : null}
                  </button>
                  <span className="mx-1 font-normal text-[#9CA3AF] dark:text-muted-foreground/80" aria-hidden>
                    →
                  </span>
                  <button
                    type="button"
                    onClick={() => handleLaneHeaderClick("delivery")}
                    className={cn(
                      "rounded-sm align-middle transition-colors hover:text-[#374151] dark:hover:text-foreground",
                      laneSort?.column === "delivery"
                        ? "font-semibold text-[#374151] dark:text-foreground"
                        : "",
                    )}
                    aria-label="Sort by delivery lane"
                  >
                    Delivery
                    {laneSort?.column === "delivery" ? (
                      laneSort.dir === "asc" ? (
                        <ArrowUp className="ml-0.5 inline-block h-3 w-3 align-middle" aria-hidden />
                      ) : (
                        <ArrowDown className="ml-0.5 inline-block h-3 w-3 align-middle" aria-hidden />
                      )
                    ) : null}
                  </button>
                </div>
              </div>
            </TableHead>
            <TableHead className="text-right align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Target Pay
            </TableHead>
            <TableHead className="text-center align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90">
              Status
            </TableHead>
            <TableHead
              className={cn(
                "text-center align-middle text-xs font-semibold uppercase tracking-wide text-[#374151] sm:text-sm dark:text-foreground/90",
                enableOpenLoadActions ? "w-[88px]" : "w-14",
              )}
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
                    {expandedId === load.id ? (
                      <ChevronDown className="inline-block h-4 w-4 align-middle" />
                    ) : (
                      <ChevronRight className="inline-block h-4 w-4 align-middle" />
                    )}
                  </TableCell>
                  <TableCell className="text-left align-middle font-medium tabular-nums text-sm sm:text-base">
                    {load.load_number || "—"}
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm sm:text-base">
                    <Badge variant="outline" className="inline-block align-middle text-xs sm:text-sm font-medium h-6 px-1.5">
                      {getLoadBoardClientPrimaryLabel(load.template_type)}
                    </Badge>
                    {aljexTemplateBadge ? (
                      <Badge
                        variant="secondary"
                        className="ml-0.5 inline-block align-middle h-6 px-1.5 py-0 text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {aljexTemplateBadge}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="loads-route-cell py-3 pl-3 pr-2 text-left align-middle text-sm sm:text-base">
                    <div className="font-bold leading-snug text-[#1A1A1A]">{collapsedRouteTitle(load)}</div>
                    <div className="mt-1 text-xs leading-snug text-[#6B7280] sm:text-sm">
                      {collapsedMetaLine(load)}
                    </div>
                  </TableCell>
                  <TableCell className="loads-target-cell py-3 px-2 text-right align-middle text-sm sm:text-base">
                    <span className="block text-lg font-bold tabular-nums text-[#111827] sm:text-xl">
                      {targetCollapsed}
                    </span>
                    {load.is_per_ton ? (
                      <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-[#6B7280]">
                        Per-ton
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm sm:text-base">
                    <span className={collapsedStatusPillClass(load)}>{collapsedStatusLabel(load)}</span>
                  </TableCell>
                  <TableCell
                    className="text-center align-middle text-sm sm:text-base"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="inline-block align-middle">
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
                    </span>
                    <span className="ml-0.5 inline-block align-middle">
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
                    </span>
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