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
import { getErrorMessage, isoTimestampNow } from "@/lib/utils";

export type PendingBookingLoad = {
  id: string;
  agency_id: string;
  load_number: string;
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

type BookingRequestModalProps = {
  load: PendingBookingLoad;
  agencyUsers: AgencyUserOption[];
  currentUserId: string;
  onComplete: () => void;
};

export function BookingRequestModal({
  load,
  agencyUsers,
  currentUserId,
  onComplete,
}: BookingRequestModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assignUserId, setAssignUserId] = useState(currentUserId);

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
      const smsText = `You're confirmed on Load #${ln}. Dispatcher will be in touch shortly.`;

      const { error: upErr } = await supabase
        .from("loads")
        .update({
          sms_book_status: "booked",
          booked_handled_at: isoTimestampNow(),
          booked_handled_by: assignUserId,
        })
        .eq("id", load.id)
        .eq("agency_id", load.agency_id);

      if (upErr) throw upErr;

      if (load.booked_by_phone?.trim()) {
        const sms = await sendBookingNotifySms(load.booked_by_phone.trim(), smsText);
        if (!sms.ok) {
          await supabase
            .from("loads")
            .update({
              sms_book_status: "pending_review",
              booked_handled_at: null,
              booked_handled_by: null,
            })
            .eq("id", load.id);
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
          handled_by: assignUserId,
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
      toast({ title: "Booking confirmed", description: "Driver notified and load updated." });
      onComplete();
    },
    onError: (e) => {
      toast({
        title: "Could not confirm booking",
        description: getErrorMessage(e),
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const smsText =
        "Sorry, that load is no longer available. Contact dispatch for other options.";

      const { error: upErr } = await supabase
        .from("loads")
        .update({
          sms_book_status: "declined",
          booked_handled_at: isoTimestampNow(),
        })
        .eq("id", load.id)
        .eq("agency_id", load.agency_id);

      if (upErr) throw upErr;

      if (load.booked_by_phone?.trim()) {
        const sms = await sendBookingNotifySms(load.booked_by_phone.trim(), smsText);
        if (!sms.ok) {
          await supabase
            .from("loads")
            .update({
              sms_book_status: "pending_review",
              booked_handled_at: null,
            })
            .eq("id", load.id);
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
      toast({ title: "Booking declined", description: "Driver notified." });
      onComplete();
    },
    onError: (e) => {
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
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md sm:max-w-lg [&>button]:hidden border-amber-500/40 shadow-lg shadow-amber-500/10"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
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
            ✅ Confirm Booked
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
