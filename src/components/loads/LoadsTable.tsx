import { useState, useMemo } from "react";
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
import { ChevronDown, ChevronRight, Package, ArrowUpDown, Filter, X, ExternalLink } from "lucide-react";
import { LoadExpandedRow } from "./LoadExpandedRow";
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

type Load = Tables<"loads">;

type SortOption = "none" | "template_type" | "pickup_city" | "pickup_state" | "dest_city" | "dest_state";

interface LoadsTableProps {
  loads: Load[];
  loading: boolean;
  onRefresh: () => void;
}

const INITIAL_DISPLAY_COUNT = 25;

export function LoadsTable({ loads, loading, onRefresh }: LoadsTableProps) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  const [sortBy, setSortBy] = useState<SortOption>("none");
  const [pickupStateFilter, setPickupStateFilter] = useState<string>("all");
  const [destStateFilter, setDestStateFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  const handleNavigateToDetail = (loadId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate(`/loads/${loadId}`);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Extract unique states and clients from loads for filter dropdowns
  const { pickupStates, destStates, clients } = useMemo(() => {
    const pickupSet = new Set<string>();
    const destSet = new Set<string>();
    const clientSet = new Set<string>();
    
    loads.forEach((load) => {
      if (load.pickup_state?.trim()) pickupSet.add(load.pickup_state.trim().toUpperCase());
      if (load.dest_state?.trim()) destSet.add(load.dest_state.trim().toUpperCase());
      if (load.template_type) clientSet.add(load.template_type);
    });
    
    return {
      pickupStates: Array.from(pickupSet).sort(),
      destStates: Array.from(destSet).sort(),
      clients: Array.from(clientSet).sort((a, b) => {
        // Custom order: VMS first, then Adelphia, then Aljex
        const order: Record<string, number> = { vms_email: 1, adelphia_xlsx: 2, aljex_flat: 3 };
        return (order[a] || 99) - (order[b] || 99);
      }),
    };
  }, [loads]);

  // Apply filters then sort
  const filteredAndSortedLoads = useMemo(() => {
    let result = loads;
    
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
    
    // Apply sorting
    if (sortBy !== "none") {
      result = [...result].sort((a, b) => {
        if (sortBy === "template_type") {
          // Custom order: VMS first, then Adelphia, then Aljex
          const templateOrder: Record<string, number> = {
            vms_email: 1,
            adelphia_xlsx: 2,
            aljex_flat: 3,
          };
          const aOrder = templateOrder[a.template_type] || 99;
          const bOrder = templateOrder[b.template_type] || 99;
          return aOrder - bOrder;
        }
        const aVal = (a[sortBy] || "").toLowerCase();
        const bVal = (b[sortBy] || "").toLowerCase();
        return aVal.localeCompare(bVal);
      });
    }
    
    return result;
  }, [loads, clientFilter, pickupStateFilter, destStateFilter, sortBy]);

  const hasActiveFilters = clientFilter !== "all" || pickupStateFilter !== "all" || destStateFilter !== "all";

  const clearFilters = () => {
    setClientFilter("all");
    setPickupStateFilter("all");
    setDestStateFilter("all");
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

  if (loads.length === 0) {
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

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Sort & Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Sort:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[160px] h-8 text-sm bg-background">
              <SelectValue placeholder="No sorting" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="none">No sorting</SelectItem>
              <SelectItem value="template_type">Client</SelectItem>
              <SelectItem value="pickup_city">Pickup City (A-Z)</SelectItem>
              <SelectItem value="pickup_state">Pickup State (A-Z)</SelectItem>
              <SelectItem value="dest_city">Delivery City (A-Z)</SelectItem>
              <SelectItem value="dest_state">Delivery State (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Filter by Client */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Client:</span>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[110px] h-8 text-sm bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">All</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client} value={client}>
                  {client === "vms_email" ? "VMS" : client === "adelphia_xlsx" ? "Adelphia" : "Aljex"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filter by Pickup State */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Pickup:</span>
          <Select value={pickupStateFilter} onValueChange={setPickupStateFilter}>
            <SelectTrigger className="w-[100px] h-8 text-sm bg-background">
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
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Delivery:</span>
          <Select value={destStateFilter} onValueChange={setDestStateFilter}>
            <SelectTrigger className="w-[100px] h-8 text-sm bg-background">
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
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        {/* Filter count indicator */}
        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground">
            Showing {filteredAndSortedLoads.length} of {loads.length}
          </span>
        )}
      </div>
      
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 border-b border-border">
            <TableHead className="w-10"></TableHead>
            <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Load #</TableHead>
            <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Client</TableHead>
            <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Ship Date</TableHead>
            <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Pickup</TableHead>
            <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Delivery</TableHead>
            <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground text-right">Invoice</TableHead>
            <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground text-right">Target Pay</TableHead>
            <TableHead className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Status</TableHead>
            <TableHead className="w-[60px] text-xs uppercase tracking-wide font-medium text-muted-foreground">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredAndSortedLoads.slice(0, displayCount).map((load) => {
            const isPending = load.status === "open" && !load.booked_by;
            return (
              <>
                <TableRow
                  key={load.id}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${isPending ? "bg-[hsl(38,92%,50%)]/5" : ""}`}
                  onClick={() => toggleExpand(load.id)}
                >
                  <TableCell>
                    {expandedId === load.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{load.load_number || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {load.template_type === "adelphia_xlsx" 
                        ? "Adelphia" 
                        : load.template_type === "vms_email" 
                          ? "VMS" 
                          : "Aljex"}
                    </Badge>
                  </TableCell>
                  <TableCell>{load.ship_date || "—"}</TableCell>
                  <TableCell>
                    {load.pickup_city && load.pickup_state
                      ? `${load.pickup_city}, ${load.pickup_state}`
                      : load.pickup_location_raw || "—"}
                  </TableCell>
                  <TableCell>
                    {load.dest_city && load.dest_state
                      ? `${load.dest_city}, ${load.dest_state}`
                      : load.dest_location_raw || "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {(() => {
                      const rate = formatRate(load);
                      return (
                        <>
                          {rate.display}
                          {rate.isPerTon && <span className="text-xs text-muted-foreground ml-1">/ ton</span>}
                        </>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    {load.target_pay && load.target_pay > 0
                      ? `$${load.target_pay.toLocaleString()}`
                      : "TBD"}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusStyles[load.status] || statusStyles.open}>
                      {load.status === "booked" ? "Booked" : load.status === "closed" ? "Closed" : load.status === "claimed" ? "Claimed" : "Open"}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={(e) => handleNavigateToDetail(load.id, e)}
                          className="h-7 w-7 p-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Details</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
                {expandedId === load.id && (
                  <TableRow key={`${load.id}-expanded`}>
                    <TableCell colSpan={10} className="p-0">
                      <LoadExpandedRow load={load} onStatusChange={onRefresh} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
      
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
  );
}