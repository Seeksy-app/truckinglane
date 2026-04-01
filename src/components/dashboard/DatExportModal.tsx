import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Download } from "lucide-react";
import {
  DAT_EXPORT_SOURCE_GROUPS,
  type DatExportSourceGroupId,
  fetchDatPendingCountsBySource,
  fetchDatPendingLoadsForSourceGroups,
  downloadDATExport,
  markDATExportComplete,
} from "@/lib/datExport";
import type { UserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: UserRole;
  impersonatedAgencyId: string | null;
  effectiveAgencyId: string | null;
  agentName: string;
};

export function DatExportModal({
  open,
  onOpenChange,
  role,
  impersonatedAgencyId,
  effectiveAgencyId,
  agentName,
}: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<DatExportSourceGroupId>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const initSelectionForOpenRef = useRef(false);

  const { data: counts = null, isLoading } = useQuery({
    queryKey: ["dat-pending-counts-by-source", role, impersonatedAgencyId],
    queryFn: () =>
      fetchDatPendingCountsBySource(supabase, {
        role,
        impersonatedAgencyId,
      }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!open) return;
    void queryClient.invalidateQueries({
      queryKey: ["dat-pending-counts-by-source", role, impersonatedAgencyId],
    });
  }, [open, queryClient, role, impersonatedAgencyId]);

  const idsWithPending = useMemo(() => {
    if (!counts) return [] as DatExportSourceGroupId[];
    return DAT_EXPORT_SOURCE_GROUPS.filter((g) => (counts[g.id] ?? 0) > 0).map((g) => g.id);
  }, [counts]);

  useEffect(() => {
    if (!open) {
      initSelectionForOpenRef.current = false;
      return;
    }
    if (counts != null && !initSelectionForOpenRef.current) {
      initSelectionForOpenRef.current = true;
      setSelected(new Set(idsWithPending));
    }
  }, [open, counts, idsWithPending]);

  const allSelected = idsWithPending.length > 0 && idsWithPending.every((id) => selected.has(id));
  const somePendingSelected = idsWithPending.some((id) => selected.has(id));
  const selectAllChecked: boolean | "indeterminate" = allSelected
    ? true
    : somePendingSelected
      ? "indeterminate"
      : false;

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(idsWithPending) : new Set());
  };

  const toggleOne = (id: DatExportSourceGroupId, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedCountTotal = useMemo(() => {
    if (!counts) return 0;
    let n = 0;
    for (const id of selected) {
      n += counts[id] ?? 0;
    }
    return n;
  }, [counts, selected]);

  const handleExport = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one source");
      return;
    }
    if (!effectiveAgencyId) {
      toast.error("No agency — cannot export");
      return;
    }
    setExporting(true);
    try {
      const groupIds = [...selected];
      const loads = await fetchDatPendingLoadsForSourceGroups(supabase, groupIds, {
        role,
        impersonatedAgencyId,
      });
      if (loads.length === 0) {
        toast.error("No exportable pending loads for the selected sources (check row filters or missing data)");
        return;
      }
      const filename = `DAT_Export_${new Date().toISOString().split("T")[0]}.csv`;
      downloadDATExport(loads, filename);

      const postedAt = new Date().toISOString();
      const loadNumbers = [
        ...new Set(loads.map((l) => String(l.load_number ?? "").trim()).filter((n) => n.length > 0)),
      ];
      const chunkSize = 120;
      if (loadNumbers.length > 0) {
        for (let i = 0; i < loadNumbers.length; i += chunkSize) {
          const chunk = loadNumbers.slice(i, i + chunkSize);
          const { error } = await supabase
            .from("loads")
            .update({ dat_posted_at: postedAt })
            .eq("agency_id", effectiveAgencyId)
            .in("load_number", chunk);
          if (error) {
            toast.error(`Failed to mark loads as posted: ${error.message}`);
            return;
          }
        }
      } else {
        const ids = [...new Set(loads.map((l) => l.id))];
        const { error } = await supabase
          .from("loads")
          .update({ dat_posted_at: postedAt })
          .eq("agency_id", effectiveAgencyId)
          .in("id", ids);
        if (error) {
          toast.error(`Failed to mark loads as posted: ${error.message}`);
          return;
        }
      }
      const { error: logError } = await supabase.from("email_import_logs").insert({
        agency_id: effectiveAgencyId,
        sender_email: "dat-csv-export@truckinglane.com",
        subject: null,
        status: "success",
        imported_count: loads.length,
        raw_headers: {
          mode: "csv",
          source: "DAT CSV Export",
          agent_name: agentName,
          count: loads.length,
          exported: loads.length,
          sources: groupIds,
        },
        error_message: null,
      });
      if (logError) {
        console.error("DAT CSV activity log:", logError);
        toast.warning("Exported CSV, but activity log could not be saved.");
      }
      markDATExportComplete();
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["dat-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dat-pending-nav-badge"] });
      queryClient.invalidateQueries({ queryKey: ["dat-pending-counts-by-source"] });
      queryClient.invalidateQueries({ queryKey: ["load_activity_logs"] });
      toast.success(`${loads.length} loads exported to DAT`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export to DAT
          </DialogTitle>
          <DialogDescription>
            Choose sources. Counts are active loads (<code className="text-xs">is_active</code>) with no DAT upload yet (
            <code className="text-xs">dat_posted_at</code> empty), grouped by source. Only Adelphia, Oldcastle, Big 500,
            VMS, and Spot Loads require complete origin and destination for export; other sources (including Trucker Tools
            and Century) can export with partial locations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center space-x-2 border-b border-border pb-3">
            <Checkbox
              id="dat-export-all"
              checked={allSelected}
              onCheckedChange={(v) => toggleAll(v === true)}
            />
            <Label htmlFor="dat-export-all" className="font-medium cursor-pointer">
              Select all
            </Label>
          </div>

          {isLoading || !counts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading counts…
            </div>
          ) : (
            <ul className="space-y-3">
              {DAT_EXPORT_SOURCE_GROUPS.map((g) => {
                const n = counts[g.id] ?? 0;
                const noPending = n === 0;
                return (
                  <li
                    key={g.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md transition-colors",
                      noPending && "opacity-60 text-muted-foreground",
                    )}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <Checkbox
                        id={`dat-src-${g.id}`}
                        checked={selected.has(g.id)}
                        onCheckedChange={(v) => toggleOne(g.id, v === true)}
                      />
                      <Label htmlFor={`dat-src-${g.id}`} className="cursor-pointer truncate">
                        {g.label}
                      </Label>
                    </div>
                    <span className="text-sm tabular-nums shrink-0 text-muted-foreground">
                      ({n} pending)
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={() => void handleExport()} disabled={exporting || selected.size === 0}>
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export selected{selectedCountTotal > 0 ? ` (${selectedCountTotal} pending)` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
