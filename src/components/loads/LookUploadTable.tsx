import { useState, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { LookUploadExpandedRow } from "./LookUploadExpandedRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  compareLoadsByStateThenCity,
  formatLaneStateCity,
  LOADS_TABLE_DENSE_CLASS,
  LOADS_TABLE_TOOLBAR_CLASS,
} from "@/lib/loadTableDisplay";
import {
  truckerToolsInvoiceColumnDisplay,
  truckerToolsNoRateRaw,
} from "@/lib/truckerToolsLoads";

type Load = Tables<"loads">;

type ToolbarSortOption = "none" | "template_type";

type LaneHeaderSort = { column: "pickup" | "delivery"; dir: "asc" | "desc" };

interface OpenLoadsTableProps {
  loads: Load[];
  loading: boolean;
  onRefresh: () => void;
}

const INITIAL_DISPLAY_COUNT = 25;

export function OpenLoadsTable({ loads, loading, onRefresh }: OpenLoadsTableProps) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [toolbarSort, setToolbarSort] = useState<ToolbarSortOption>("none");
  const [laneSort, setLaneSort] = useState<LaneHeaderSort | null>(null);
  const [pickupStateFilter, setPickupStateFilter] = useState<string>("all");
  const [destStateFilter, setDestStateFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  // Defensive: active open loads only; exclude archived dispatch (matches dashboard query).
  const openLoads = useMemo(() => {
    return loads.filter(
      (l) => l.status === "open" && l.is_active && l.dispatch_status !== "archived",
    );
  }, [loads]);

  const handleNavigateToDetail = (loadId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate(`/loads/${loadId}`);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const { pickupStates, destStates, clients, clientCounts } = useMemo(() => {
    const pickupSet = new Set<string>();
    const destSet = new Set<string>();
    const clientSet = new Set<string>();
    const countMap: Record<string, number> = {};
    openLoads.forEach((load) => {
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
        const order: Record<string, number> = { vms_email: 1, adelphia_xlsx: 2, aljex_flat: 3, aljex_spot: 4, oldcastle_gsheet: 5 };
        return (order[a] || 99) - (order[b] || 99);
      }),
      clientCounts: countMap,
    };
  }, [openLoads]);

  const filteredAndSortedLoads = useMemo(() => {
    let result = openLoads;
    if (clientFilter !== "all") result = result.filter((l) => l.template_type === clientFilter);
    if (pickupStateFilter !== "all")
      result = result.filter((l) => l.pickup_state?.trim().toUpperCase() === pickupStateFilter);
    if (destStateFilter !== "all")
      result = result.filter((l) => l.dest_state?.trim().toUpperCase() === destStateFilter);
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
          aljex_spot: 4,
          oldcastle_gsheet: 5,
        };
        return (templateOrder[a.template_type] || 99) - (templateOrder[b.template_type] || 99);
      });
    }
    return result;
  }, [openLoads, clientFilter, pickupStateFilter, destStateFilter, toolbarSort, laneSort]);

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

  const openBadgeClass = "bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,40%)] border-[hsl(25,95%,53%)]/30";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (openLoads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No open loads found</p>
        <p className="text-sm">Import a CSV file to get started</p>
      </div>
    );
  }

  const formatRate = (load: Load): { display: string; isPerTon: boolean } => {
    const ttInv = truckerToolsInvoiceColumnDisplay(load);
    if (ttInv) return ttInv;
    if (load.is_per_ton) {
      if (load.rate_raw && load.rate_raw > 0) return { display: `$${load.rate_raw.toLocaleString()}`, isPerTon: true };
      return { display: "TBD", isPerTon: false };
    }
    if (load.customer_invoice_total && load.customer_invoice_total > 0)
      return { display: `$${load.customer_invoice_total.toLocaleString()}`, isPerTon: false };
    if (load.rate_raw && load.rate_raw > 0) return { display: `$${load.rate_raw.toLocaleString()}`, isPerTon: false };
    return { display: "TBD", isPerTon: false };
  };

  return (
    <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
      <div className={LOADS_TABLE_TOOLBAR_CLASS}>
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
            <SelectTrigger className="w-[140px] h-9 text-sm sm:text-base bg-background">
              <SelectValue placeholder="No sorting" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="none">No sorting</SelectItem>
              <SelectItem value="template_type">Client</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Client:</span>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[100px] h-9 text-sm sm:text-base bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">All ({openLoads.length})</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client} value={client}>
                  {client === "vms_email" ? "VMS" : client === "adelphia_xlsx" ? "Adelphia" : client === "oldcastle_gsheet" ? "Oldcastle" : "Aljex"} ({clientCounts[client] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Pickup:</span>
          <Select value={pickupStateFilter} onValueChange={setPickupStateFilter}>
            <SelectTrigger className="w-[92px] h-9 text-sm sm:text-base bg-background">
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
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Delivery:</span>
          <Select value={destStateFilter} onValueChange={setDestStateFilter}>
            <SelectTrigger className="w-[92px] h-9 text-sm sm:text-base bg-background">
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
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 px-2 text-sm sm:text-base text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
        {hasActiveFilters && (
          <span className="text-sm sm:text-base text-muted-foreground">
            Showing {filteredAndSortedLoads.length} of {openLoads.length}
          </span>
        )}
      </div>

      <div className="w-full min-w-0 overflow-x-auto">
        <Table className={LOADS_TABLE_DENSE_CLASS}>
        <TableHeader>
          <TableRow className="bg-muted/50 border-b border-border">
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
            <TableHead className="w-14 text-[10px] uppercase tracking-wide font-medium text-muted-foreground text-center">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredAndSortedLoads.slice(0, displayCount).map((load) => (
            <Fragment key={load.id}>
              <TableRow
                className="cursor-pointer transition-colors hover:bg-muted/50 bg-[hsl(38,92%,50%)]/5"
                onClick={() => toggleExpand(load.id)}
              >
                <TableCell className="w-8 px-0.5 text-center align-middle text-sm sm:text-base">
                  <span className="inline-flex justify-center">
                    {expandedId === load.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                </TableCell>
                <TableCell className="text-center font-medium tabular-nums text-sm sm:text-base">
                  {load.load_number || "—"}
                </TableCell>
                <TableCell className="text-center align-middle text-sm sm:text-base">
                  <Badge variant="outline" className="text-[10px] h-5 px-1">
                    {load.template_type === "adelphia_xlsx"
                      ? "Adelphia"
                      : load.template_type === "vms_email"
                        ? "VMS"
                        : load.template_type === "oldcastle_gsheet"
                          ? "Oldcastle"
                          : "Aljex"}
                  </Badge>
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
                        {rate.isPerTon && <span className="text-[10px] text-muted-foreground ml-0.5">/ ton</span>}
                      </>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-center tabular-nums text-sm sm:text-base">
                  {truckerToolsNoRateRaw(load)
                    ? "—"
                    : load.target_pay && load.target_pay > 0
                      ? `$${load.target_pay.toLocaleString()}`
                      : "TBD"}
                </TableCell>
                <TableCell className="text-center align-middle text-sm sm:text-base">
                  <div className="flex justify-center">
                    <Badge className={`${openBadgeClass} text-[10px] h-5 px-1.5`}>Open</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-center align-middle text-sm sm:text-base" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleNavigateToDetail(load.id, e)}
                          className="h-6 w-6 p-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Details</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
              {expandedId === load.id && (
                <TableRow>
                  <TableCell colSpan={10} className="!p-0">
                    <LookUploadExpandedRow load={load} onStatusChange={onRefresh} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      </div>

      {filteredAndSortedLoads.length > displayCount && (
        <div className="flex items-center justify-center gap-3 py-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => setDisplayCount((prev) => prev + 25)}>
            Load More ({filteredAndSortedLoads.length - displayCount} remaining)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDisplayCount(filteredAndSortedLoads.length)}>
            Show All ({filteredAndSortedLoads.length})
          </Button>
        </div>
      )}
    </div>
  );
}
