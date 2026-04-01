import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { UserRole } from "@/hooks/useUserRole";
import {
  fetchDatPendingTotalForReminder,
  isDatReminderBusinessHoursCentral,
  minutesSinceLastDatExport,
  datReminderDismissedWithinMinutes,
  DAT_REMINDER_DISMISS_KEY,
  DAT_REMINDER_NUDGE_KEY,
} from "@/lib/datExport";
import { playDatReminderDing } from "@/lib/datReminderSound";

type Opts = {
  role: UserRole;
  impersonatedAgencyId: string | null;
};

export function useDatPendingReminder(isAdmin: boolean, opts: Opts) {
  const [clockTick, setClockTick] = useState(0);

  const { data: pending = 0 } = useQuery({
    queryKey: ["dat-reminder-pending", opts.role, opts.impersonatedAgencyId],
    queryFn: () =>
      fetchDatPendingTotalForReminder(supabase, {
        role: opts.role,
        impersonatedAgencyId: opts.impersonatedAgencyId,
      }),
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!isAdmin) return;
    const id = window.setInterval(() => setClockTick((n) => n + 1), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [isAdmin]);

  const showBanner = useMemo(() => {
    if (!isAdmin) return false;
    if (pending <= 0) return false;
    if (!isDatReminderBusinessHoursCentral()) return false;
    if (minutesSinceLastDatExport() < 30) return false;
    if (datReminderDismissedWithinMinutes(30)) return false;
    return true;
  }, [isAdmin, pending, clockTick]);

  useEffect(() => {
    if (!isAdmin) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!showBanner || pending <= 0) return;
    const last = localStorage.getItem(DAT_REMINDER_NUDGE_KEY);
    const now = Date.now();
    if (last && now - new Date(last).getTime() < 30 * 60 * 1000) return;
    localStorage.setItem(DAT_REMINDER_NUDGE_KEY, new Date().toISOString());
    playDatReminderDing();
    if (Notification.permission === "granted") {
      try {
        new Notification(`TruckingLanes: ${pending} loads pending DAT upload`, {
          tag: "dat-pending-reminder",
        });
      } catch {
        // ignore
      }
    }
  }, [showBanner, pending]);

  const dismissBanner = useCallback(() => {
    localStorage.setItem(DAT_REMINDER_DISMISS_KEY, new Date().toISOString());
    setClockTick((n) => n + 1);
  }, []);

  return { showBanner, pendingCount: pending, dismissBanner };
}
