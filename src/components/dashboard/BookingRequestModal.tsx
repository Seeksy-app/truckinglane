import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PhoneDisplay } from "@/components/ui/phone-display";
import { sendBookingNotifySms } from "@/lib/bookingNotifySms";
import { getErrorMessage } from "@/lib/utils";

export type PendingBookingLoad = {
  id: string;
  agency_id: string;
  load_number: string;
  /** Prior status (for reverting if SMS fails after claim). */
  status: string;
  pickup_city: string | null;
  pickup_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  trailer_type: string | null;
  target_pay: number | null;
  booked_by_phone: string | null;
  booked_by_mc: string | null;
  booked_by_company: string | null;
};

export type AgencyUserOption = {
  user_id: string;
  label: string;
};

type RpcOk = { ok?: boolean; error?: string; detail?: string };

function readRpcResult(data: unknown): RpcOk {
  if (data && typeof data === "object" && "ok" in data) {
    return data as RpcOk;
  }
  return { ok: false, error: "invalid_rpc_response" };
}

type BookingRequestModalProps = {
  load: PendingBookingLoad;
  agencyUsers: AgencyUserOption[];
  currentUserId: string;
  /** Dashboard `useLoads().refetch` so BOOKED KPI updates (loads are not React Query–cached). */
  refetchLoads: () => void;
  /** Close / X / overlay — user can dismiss if stuck (e.g. RPC not deployed yet). */
  onDismiss: () => void;
  onComplete: () => void;
};

export function BookingRequestModal({
  load,
  agencyUsers,
  currentUserId,
  refetchLoads,
  onDismiss,
  onComplete,
}: BookingRequestModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assignUserId, setAssignUserId] = useState(currentUserId);
  const [dialogOpen, setDialogOpen] = useState(true);

  useEffect(() => {
    setDialogOpen(true);
  }, [load.id]);

  useEffect(() => {
    if (agencyUsers.length === 0) {
      setAssignUserId(currentUserId);
      return;
    }
    const ids = new Set(agencyUsers.map((u) => u.user_id));
    if (ids.has(currentUserId)) {
      setAssignUserId(currentUserId);
    } else {
      setAssignUserId(agencyUsers[0].user_id);
    }
  }, [agencyUsers, currentUserId, load.id]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["loads"] });
    queryClient.invalidateQueries({ queryKey: ["pending_sms_bookings"] });
    queryClient.invalidateQueries({ queryKey: ["load_activity_logs"] });
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const ln = load.load_number?.trim() || "—";
      const smsText = `You're confirmed on Load #${ln}. Your dispatcher will be in touch shortly. — D&L Transport`;

      const { data: rpcData, error: rpcErr } = await supabase.rpc("claim_sms_booking_load", {
        p_load_id: load.id,
        p_load_number: load.load_number,
      });

      if (rpcErr) {
        console.error("[BookingRequestModal] claim_sms_booking_load transport error", rpcErr, {
          code: rpcErr.code,
          message: rpcErr.message,
          details: rpcErr.details,
          hint: rpcErr.hint,
        });
        throw rpcErr;
      }

      const claimed = readRpcResult(rpcData);
      if (!claimed.ok) {
        console.error("[BookingRequestModal] claim_sms_booking_load rejected", rpcData);
        throw new Error(
          [claimed.error, claimed.detail].filter(Boolean).join(": ") || "claim_failed",
        );
      }

      if (load.booked_by_phone?.trim()) {
        const sms = await sendBookingNotifySms(load.booked_by_phone.trim(), smsText);
        if (!sms.ok) {
          console.error("[BookingRequestModal] Claim SMS failed, reverting load", sms);
          const { data: revData, error: revErr } = await supabase.rpc("revert_sms_booking_claim", {
            p_load_id: load.id,
            p_load_number: load.load_number,
            p_prev_status: load.status || "open",
          });
          if (revErr) {
            console.error("[BookingRequestModal] revert_sms_booking_claim error", revErr);
          } else {
            const rev = readRpcResult(revData);
            if (!rev.ok) {
              console.error("[BookingRequestModal] revert_sms_booking_claim rejected", revData);
            }
          }
          throw new Error(sms.error || "SMS send failed");
        }
      } else {
        toast({
          title: "Booked (no SMS)",
          description: "No driver phone on file; load marked booked without texting.",
        });
      }

      const { error: logErr } = await supabase.from("load_activity_logs").insert({
        agency_id: load.agency_id,
        action: "sms_booking_confirmed",
        meta: {
          load_id: load.id,
          load_number: load.load_number,
          handled_by: currentUserId,
          assigned_to: assignUserId,
          booked_by_phone: load.booked_by_phone,
        },
      });
      if (logErr) {
        toast({
          title: "Audit log failed",
          description: logErr.message,
          variant: "destructive",
        });
      }
    },
    onSuccess: () => {
      invalidate();
      refetchLoads();
      toast({ title: "Load claimed", description: "Driver notified and load updated." });
      onComplete();
    },
    onError: (e) => {
      console.error("[BookingRequestModal] Claim mutation error", e);
      toast({
        title: "Could not claim load",
        description: getErrorMessage(e),
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const smsText =
        "Sorry, that load is no longer available. Contact dispatch for other options. — D&L Transport";

      const { data: rpcData, error: rpcErr } = await supabase.rpc("decline_sms_booking_load", {
        p_load_id: load.id,
        p_load_number: load.load_number,
      });

      if (rpcErr) {
        console.error("[BookingRequestModal] decline_sms_booking_load transport error", rpcErr, {
          code: rpcErr.code,
          message: rpcErr.message,
          details: rpcErr.details,
          hint: rpcErr.hint,
        });
        throw rpcErr;
      }

      const declined = readRpcResult(rpcData);
      if (!declined.ok) {
        console.error("[BookingRequestModal] decline_sms_booking_load rejected", rpcData);
        throw new Error(
          [declined.error, declined.detail].filter(Boolean).join(": ") || "decline_failed",
        );
      }

      if (load.booked_by_phone?.trim()) {
        const sms = await sendBookingNotifySms(load.booked_by_phone.trim(), smsText);
        if (!sms.ok) {
          console.error("[BookingRequestModal] Decline SMS failed — load already declined in DB", sms);
          throw new Error(sms.error || "SMS send failed");
        }
      } else {
        toast({
          title: "Declined (no SMS)",
          description: "No driver phone on file; load marked declined without texting.",
        });
      }

      const { error: logErr } = await supabase.from("load_activity_logs").insert({
        agency_id: load.agency_id,
        action: "sms_booking_declined",
        meta: {
          load_id: load.id,
          load_number: load.load_number,
          booked_by_phone: load.booked_by_phone,
        },
      });
      if (logErr) {
        toast({
          title: "Audit log failed",
          description: logErr.message,
          variant: "destructive",
        });
      }
    },
    onSuccess: () => {
      invalidate();
      refetchLoads();
      toast({ title: "Booking declined", description: "Driver notified." });
      onComplete();
    },
    onError: (e) => {
      console.error("[BookingRequestModal] Decline mutation error", e);
      toast({
        title: "Could not decline booking",
        description: getErrorMessage(e),
        variant: "destructive",
      });
    },
  });

  const busy = confirmMutation.isPending || declineMutation.isPending;

  const route = [
    [load.pickup_city, load.pickup_state].filter(Boolean).join(", "),
    [load.dest_city, load.dest_state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" → ");

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="max-w-md sm:max-w-lg border-amber-500/40 shadow-lg shadow-amber-500/10">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <span aria-hidden>🚨</span>
            New Booking Request
          </DialogTitle>
          <div className="text-left space-y-3 pt-2 text-sm">
            <p className="font-semibold text-foreground">Load #{load.load_number}</p>
            <div className="space-y-1 text-muted-foreground">
              {route ? <p>{route}</p> : null}
              <p>
                <span className="text-muted-foreground">Trailer: </span>
                {load.trailer_type?.trim() || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Rate: </span>$
                {load.target_pay != null && Number.isFinite(load.target_pay) ? load.target_pay : "—"}
              </p>
            </div>
            <div className="border-t border-border pt-3 space-y-1 text-foreground">
              <p>
                <span className="text-muted-foreground">Driver phone: </span>
                {load.booked_by_phone ? (
                  <PhoneDisplay phone={load.booked_by_phone} />
                ) : (
                  "—"
                )}
              </p>
              <p>
                <span className="text-muted-foreground">MC#: </span>
                {load.booked_by_mc?.trim() || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Company: </span>
                {load.booked_by_company?.trim() || "—"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="assign-booking">Assign to</Label>
          <Select value={assignUserId} onValueChange={setAssignUserId} disabled={busy}>
            <SelectTrigger id="assign-booking" className="w-full">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              {agencyUsers.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button
            type="button"
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => declineMutation.mutate()}
          >
            ❌ Decline
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || !assignUserId || agencyUsers.length === 0}
            onClick={() => confirmMutation.mutate()}
          >
            ✅ Claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
