import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationSettings } from "@/hooks/useNotifications";
import { useToast } from "@/hooks/use-toast";
import { playLeadNotificationDing } from "@/lib/leadNotificationSound";
import { formatPhone } from "@/lib/utils";

export type LeadNotificationOptions = {
  /** Agency to filter realtime inserts (use effective agency id on dashboard, incl. impersonation). */
  agencyId: string | null | undefined;
  /** When true, do not play the Web Audio ding. */
  soundMuted: boolean;
};

/**
 * Subscribes to new leads for the agency. Plays a ding + in-app toast; optional desktop notification from settings.
 * Intended only while the dashboard is mounted so agents hear alerts only on that page.
 */
export function useLeadNotifications({ agencyId, soundMuted }: LeadNotificationOptions) {
  const { user } = useAuth();
  const { settings } = useNotificationSettings();
  const { toast } = useToast();
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Unlock AudioContext after first user gesture (browser autoplay policy)
  useEffect(() => {
    const unlock = async () => {
      if (audioCtxRef.current) return;
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        const ctx = new AC();
        await ctx.resume();
        audioCtxRef.current = ctx;
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!user?.id || !agencyId) return;

    const channel = supabase
      .channel(`new-leads-${agencyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `agency_id=eq.${agencyId}`,
        },
        async (payload) => {
          const newLead = payload.new as {
            id: string;
            caller_phone: string;
            caller_name: string | null;
            caller_company: string | null;
            equipment_type: string | null;
            is_high_intent: boolean | null;
            intent_score: number | null;
            notes: string | null;
            created_at: string;
          };

          const equipment = newLead.equipment_type?.trim();
          const carrierLine = equipment || newLead.caller_company?.trim() || null;

          const rawPhone = newLead.caller_phone?.trim();
          const formattedPhone = rawPhone ? formatPhone(rawPhone) : "Unknown";
          const intentLine =
            newLead.intent_score != null
              ? `Intent: ${newLead.intent_score}%`
              : newLead.is_high_intent
                ? "High intent"
                : null;
          const clickToLead = () => {
            window.location.href = `/leads/${newLead.id}`;
          };

          toast({
            title: "New lead incoming!",
            description: [formattedPhone, intentLine, equipment ? `Equipment: ${equipment}` : null]
              .filter(Boolean)
              .join(" • "),
            duration: 6000,
            className: "cursor-pointer hover:bg-muted/40 transition-colors",
            onClick: clickToLead,
          });

          if (!soundMuted && audioCtxRef.current) {
            try {
              if (audioCtxRef.current.state === "suspended") {
                await audioCtxRef.current.resume();
              }
              playLeadNotificationDing(audioCtxRef.current);
            } catch (e) {
              console.log("Could not play lead notification sound:", e);
            }
          }

          if (settings.chat_desktop && "Notification" in window && Notification.permission === "granted") {
            const parts: string[] = [];
            if (newLead.caller_name) parts.push(newLead.caller_name);
            if (newLead.caller_company) parts.push(newLead.caller_company);
            parts.push(formattedPhone);
            if (newLead.intent_score != null) parts.push(`Intent ${newLead.intent_score}%`);
            const summary = newLead.notes?.slice(0, 100);
            const body = summary
              ? `${parts.join(" • ")}\n${summary}${newLead.notes && newLead.notes.length > 100 ? "..." : ""}`
              : parts.join(" • ");

            const notification = new Notification("New lead incoming!", {
              body: equipment ? `Equipment: ${equipment} — ${body}` : carrierLine ? `${carrierLine} — ${body}` : body,
              icon: "/favicon.svg",
              tag: `lead-${newLead.id}`,
              requireInteraction: !!newLead.is_high_intent,
            });

            notification.onclick = () => {
              window.focus();
              window.location.href = `/leads/${newLead.id}`;
              notification.close();
            };

            if (!newLead.is_high_intent) {
              setTimeout(() => notification.close(), 10000);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, agencyId, soundMuted, settings.chat_desktop, toast]);

  const requestPermission = async (): Promise<boolean> => {
    if (!("Notification" in window)) {
      toast({
        title: "Browser notifications not supported",
        description: "Your browser doesn't support push notifications.",
        variant: "destructive",
      });
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      toast({
        title: "Notifications blocked",
        description: "Please enable notifications in your browser settings.",
        variant: "destructive",
      });
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === "granted";
  };

  return { requestPermission };
}
