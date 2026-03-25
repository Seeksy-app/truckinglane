import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Upload, AlertTriangle, CheckCircle2, MapPin } from "lucide-react";

interface FailedLoad {
  id: string;
  load_number: string;
  pickup_city: string | null;
  pickup_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  template_type: string | null;
}

export function DATStatusCard() {
  const queryClient = useQueryClient();
  const [showFailed, setShowFailed] = useState(false);
  const [editLoad, setEditLoad] = useState<FailedLoad | null>(null);
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [posting, setPosting] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["dat-stats"],
    queryFn: async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/loads?is_active=eq.true&select=id,load_number,pickup_city,pickup_state,dest_city,dest_state,template_type,dat_posted_at`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      const loads: any[] = await resp.json();
      const posted = loads.filter(l => l.dat_posted_at);
      const failed = loads.filter(l => !l.dat_posted_at && (!l.pickup_city || !l.dest_city));
      const pending = loads.filter(l => !l.dat_posted_at && l.pickup_city && l.dest_city);
      return { total: loads.length, posted: posted.length, failed: failed.length, pending: pending.length, failedLoads: failed as FailedLoad[] };
    },
    refetchInterval: 60000,
  });

  const handleEditLoad = (load: FailedLoad) => {
    setEditLoad(load);
    setEditCity(load.dest_city || "");
    setEditState(load.dest_state || "");
  };

  const handleSave = async () => {
    if (!editLoad) return;
    setPosting(editLoad.id);
    try {
      await supabase.from("loads").update({ dest_city: editCity, dest_state: editState }).eq("id", editLoad.id);
      toast.success(`Load ${editLoad.load_number} updated — queued for next DAT sync`);
      setEditLoad(null);
      queryClient.invalidateQueries({ queryKey: ["dat-stats"] });
    } catch {
      toast.error("Failed to update load");
    } finally {
      setPosting(null);
    }
  };

  const posted = stats?.posted ?? 0;
  const failed = stats?.failed ?? 0;
  const pending = stats?.pending ?? 0;

  return (
    <TooltipProvider>
      <>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Card
              className="cursor-pointer transition-all duration-200 border-2 bg-card border-border hover:border-blue-500/50 hover:bg-blue-500/5"
              onClick={() => failed > 0 && setShowFailed(true)}
            >
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center justify-between mb-1">
                  <Upload className="h-4 w-4 text-blue-500" />
                  {failed > 0 && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </div>
                <div className="text-2xl font-bold text-foreground">{posted}</div>
                <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                  <span className="text-xs">DAT Board</span>
                  {failed > 0 && (
                    <span className="text-xs text-amber-500 font-medium">{failed} failed</span>
                  )}
                  {pending > 0 && (
                    <span className="text-xs text-blue-400">{pending} pending</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>{posted} loads live on DAT{failed > 0 ? ` • ${failed} failed (click to fix)` : ""}{pending > 0 ? ` • ${pending} pending sync` : ""}</p>
          </TooltipContent>
        </Tooltip>

        {/* Failed Loads Modal */}
        <Dialog open={showFailed} onOpenChange={setShowFailed}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Failed DAT Uploads ({failed})
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              These loads couldn't post to DAT — usually a missing or unrecognized destination. Click a load to fix it.
            </p>
            <div className="space-y-2">
              {stats?.failedLoads.map(load => (
                <div key={load.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{load.load_number}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {load.pickup_city || "?"}, {load.pickup_state || "?"} →{" "}
                      {load.dest_city
                        ? <>{load.dest_city}, {load.dest_state}</>
                        : <span className="text-amber-500 font-medium">Missing destination</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleEditLoad(load)} className="ml-3 shrink-0">
                    Fix & Post
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Load Modal */}
        <Dialog open={!!editLoad} onOpenChange={() => setEditLoad(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Fix Destination — {editLoad?.load_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <span className="text-muted-foreground">Pickup: </span>
                {editLoad?.pickup_city}, {editLoad?.pickup_state}
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Destination City</Label>
                  <Input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="e.g. Chicago" />
                </div>
                <div className="space-y-1.5">
                  <Label>Destination State (2-letter)</Label>
                  <Input value={editState} onChange={e => setEditState(e.target.value.toUpperCase().slice(0, 2))} placeholder="e.g. IL" maxLength={2} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditLoad(null)}>Cancel</Button>
                <Button className="flex-1" disabled={!editCity || !editState || posting === editLoad?.id} onClick={handleSave}>
                  <Upload className="h-4 w-4 mr-2" />
                  Save & Queue for DAT
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    </TooltipProvider>
  );
}
