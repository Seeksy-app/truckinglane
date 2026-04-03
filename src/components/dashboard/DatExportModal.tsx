import { useState, useEffect, useMemo } from "react";
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
} from "@/config/datExportModalSources";
import {
  fetchDatPendingCountsBySource,
  fetchDatPendingLoadsForSourceGroups,
  fetchDatAllActiveOpenLoadsCount,
  fetchDatAllActiveOpenLoadsForExport,
  downloadDATExport,
  formatDatExportDownloadMessage,
  isExportableLoad,
  markDATExportComplete,
} from "@/lib/datExport";
import type { UserRole } from "@/hooks/useUserRole";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type LoadRow = Tables<"loads">;

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
  const [exporting, setExporting] = useState<"none" | "selected" | "all_active">("none");

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

  const { data: allActiveOpenCount = 0, isLoading: allActiveCountLoading } = useQuery({
    queryKey: ["dat-all-active-open-count", role, impersonatedAgencyId],
    queryFn: () =>
      fetchDatAllActiveOpenLoadsCount(supabase, {
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

  /** Nothing pre-selected — broker chooses sources each time the modal opens. */
  useEffect(() => {
    if (open) {
      setSelected(new Set());
    }
  }, [open]);

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

  const toggleOne = (id: DatExportSourceGroupId, checked: boolean, pendingCount: number) => {
    if (pendingCount <= 0) return;
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

  const runPostExport = async (
    exportableLoads: LoadRow[],
    filename: string,
    rawHeadersExtras: Record<string, unknown>,
  ) => {
    if (!effectiveAgencyId) {
      toast.error("No agency — cannot export");
      return false;
    }
    const { fileCount, totalRows } = await downloadDATExport(exportableLoads, filename);

    const postedAt = new Date().toISOString();
    const loadNumbers = [
      ...new Set(
        exportableLoads.map((l) => String(l.load_number ?? "").trim()).filter((n) => n.length > 0),
      ),
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
          return false;
        }
      }
    } else {
      const ids = [...new Set(exportableLoads.map((l) => l.id))];
      const { error } = await supabase
        .from("loads")
        .update({ dat_posted_at: postedAt })
        .eq("agency_id", effectiveAgencyId)
        .in("id", ids);
      if (error) {
        toast.error(`Failed to mark loads as posted: ${error.message}`);
        return false;
      }
    }
    const { error: logError } = await supabase.from("email_import_logs").insert({
      agency_id: effectiveAgencyId,
      sender_email: "dat-csv-export@truckinglane.com",
      subject: null,
      status: "success",
      imported_count: totalRows,
      raw_headers: {
        mode: "csv",
        source: "DAT CSV Export",
        agent_name: agentName,
        count: totalRows,
        exported: totalRows,
        ...rawHeadersExtras,
        ...(fileCount > 1 ? { zip_csv_parts: fileCount } : {}),
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
    queryClient.invalidateQueries({ queryKey: ["dat-all-active-open-count"] });
    queryClient.invalidateQueries({ queryKey: ["load_activity_logs"] });
    toast.success(formatDatExportDownloadMessage(totalRows, fileCount));
    onOpenChange(false);
    return true;
  };

  const handleExport = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one source");
      return;
    }
    if (!effectiveAgencyId) {
      toast.error("No agency — cannot export");
      return;
    }
    setExporting("selected");
    try {
      const groupIds = [...selected];
      const loads = await fetchDatPendingLoadsForSourceGroups(supabase, groupIds, {
        role,
        impersonatedAgencyId,
      });
      const exportableLoads = loads.filter(isExportableLoad);
      if (exportableLoads.length === 0) {
        toast.error("No exportable pending loads for the selected sources (check row filters or missing data)");
        return;
      }
      const filename = `DAT_Export_${new Date().toISOString().split("T")[0]}.csv`;
      await runPostExport(exportableLoads, filename, { sources: groupIds });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting("none");
    }
  };

  const handleExportAllActive = async () => {
    if (!effectiveAgencyId) {
      toast.error("No agency — cannot export");
      return;
    }
    setExporting("all_active");
    try {
      const loads = await fetchDatAllActiveOpenLoadsForExport(supabase, {
        role,
        impersonatedAgencyId,
      });
      const exportableLoads = loads.filter(isExportableLoad);
      if (exportableLoads.length === 0) {
        toast.error("No exportable active loads (check missing origin/destination where required)");
        return;
      }
      const day = new Date().toISOString().split("T")[0];
      const filename = `DAT_Export_AllActive_${day}.csv`;
      await runPostExport(exportableLoads, filename, {
        export_mode: "all_active_open",
        total_active_open: loads.length,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting("none");
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
            Select which sources to include — nothing is pre-checked. Sources with pending loads are highlighted; sources
            with zero pending cannot be selected. Counts are on the dispatch board (
            <code className="text-xs">dispatch_status</code> = open, or null dispatch with{" "}
            <code className="text-xs">status</code> = open), active (<code className="text-xs">is_active</code>), with no
            DAT upload yet (
            <code className="text-xs">dat_posted_at</code> empty). Adelphia, Oldcastle, Big 500, VMS,
            Spot Loads, and SEMCO require complete origin and destination for export; Trucker Tools and
            Century can export with partial locations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center space-x-2 border-b border-border pb-3">
            <Checkbox
              id="dat-export-all"
              checked={allSelected}
              disabled={idsWithPending.length === 0}
              onCheckedChange={(v) => toggleAll(v === true)}
            />
            <Label
              htmlFor="dat-export-all"
              className={cn(
                "font-medium",
                idsWithPending.length === 0 ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer",
              )}
            >
              Select all with pending
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
                const hasPending = n > 0;
                return (
                  <li
                    key={g.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border border-transparent px-1 py-0.5 -mx-1 transition-colors",
                      hasPending && "border-primary/25 bg-primary/5",
                      noPending && "opacity-50 text-muted-foreground",
                    )}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <Checkbox
                        id={`dat-src-${g.id}`}
                        checked={selected.has(g.id)}
                        disabled={noPending}
                        onCheckedChange={(v) => toggleOne(g.id, v === true, n)}
                      />
                      <Label
                        htmlFor={`dat-src-${g.id}`}
                        className={cn(
                          "truncate",
                          noPending ? "cursor-not-allowed" : "cursor-pointer",
                          hasPending && "font-semibold text-foreground",
                        )}
                      >
                        {g.label}
                      </Label>
                    </div>
                    <span
                      className={cn(
                        "text-sm tabular-nums shrink-0",
                        hasPending ? "font-semibold text-primary" : "text-muted-foreground",
                      )}
                    >
                      ({n} pending)
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-col sm:space-x-0">
          <div className="flex w-full flex-row justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={exporting !== "none"}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleExport()} disabled={exporting !== "none" || selected.size === 0}>
              {exporting === "selected" ? (
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
          </div>
          <div className="w-full space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              This will re-export all active loads including previously uploaded ones
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full border-slate-800 text-slate-900 hover:bg-slate-100 dark:border-slate-300 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => void handleExportAllActive()}
              disabled={
                exporting !== "none" ||
                allActiveCountLoading ||
                allActiveOpenCount === 0
              }
            >
              {exporting === "all_active" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export All Active (
                  {allActiveCountLoading ? "…" : allActiveOpenCount})
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
