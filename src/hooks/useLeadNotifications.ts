import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useNotificationSettings } from "@/hooks/useNotifications";
import { useToast } from "@/hooks/use-toast";

// Sound for notifications (optional)
const NOTIFICATION_SOUND_URL = "/notification.mp3";

export function useLeadNotifications() {
  const { user } = useAuth();
  const { agencyId } = useUserRole();
  const { settings } = useNotificationSettings();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      // Don't auto-request - let user trigger via settings
    }
  }, []);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.5;
  }, []);

  // Subscribe to new leads via Supabase Realtime
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
            is_high_intent: boolean | null;
            notes: string | null;
            created_at: string;
          };

          // Format phone for display - handle +1 country code properly
          const phone = newLead.caller_phone || "Unknown";
          const digits = phone.replace(/\D/g, "");
          // Remove leading 1 if it's a US number
          const nationalDigits = digits.length === 11 && digits.startsWith("1") 
            ? digits.slice(1) 
            : digits;
          const formattedPhone = nationalDigits.length === 10
            ? `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3, 6)}-${nationalDigits.slice(6)}`
            : phone;
          
          const isHighIntent = newLead.is_high_intent;
          const title = isHighIntent ? "🔥 High Intent Lead!" : "📞 New Lead";
          
          // Build body with company, phone, and summary
          const parts: string[] = [];
          if (newLead.caller_name) parts.push(newLead.caller_name);
          if (newLead.caller_company) parts.push(newLead.caller_company);
          parts.push(formattedPhone);
          
          // Add summary/notes if available (truncated)
          const summary = newLead.notes?.slice(0, 100);
          const body = summary 
            ? `${parts.join(" • ")}\n${summary}${newLead.notes && newLead.notes.length > 100 ? "..." : ""}`
            : parts.join(" • ");

          // Show in-app toast notification
          toast({
            title,
            description: body,
            duration: 8000,
          });

          // Play sound if enabled
          if (settings.chat_sound && audioRef.current) {
            try {
              audioRef.current.currentTime = 0;
              await audioRef.current.play();
            } catch (e) {
              // Audio play may fail if user hasn't interacted with page
              console.log("Could not play notification sound:", e);
            }
          }

          // Show browser notification if enabled and permission granted
          if (settings.chat_desktop && "Notification" in window && Notification.permission === "granted") {
            const notification = new Notification(title, {
              body,
              icon: "/favicon.svg",
              tag: `lead-${newLead.id}`,
              requireInteraction: isHighIntent, // Keep high-intent visible until dismissed
            });

            // Click handler to focus the app
            notification.onclick = () => {
              window.focus();
              // Navigate to lead in dashboard
              const url = new URL(window.location.href);
              url.pathname = "/dashboard";
              url.searchParams.set("lead", newLead.caller_phone);
              window.location.href = url.toString();
              notification.close();
            };

            // Auto-close after 10 seconds for non-high-intent
            if (!isHighIntent) {
              setTimeout(() => notification.close(), 10000);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, agencyId, settings.chat_sound, settings.chat_desktop, toast]);

  // Helper to request permission
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
