import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useRealtimeDashboard = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to leads changes
    const leadsChannel = supabase
      .channel("realtime-leads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        (payload) => {
          console.log("Leads change:", payload);
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-leads"] });
        }
      )
      .subscribe();

    // Subscribe to loads changes
    const loadsChannel = supabase
      .channel("realtime-loads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loads" },
        (payload) => {
          console.log("Loads change:", payload);
          queryClient.invalidateQueries({ queryKey: ["loads"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-ai-bookings"] });
        }
      )
      .subscribe();

    // Subscribe to phone_calls changes
    const callsChannel = supabase
      .channel("realtime-calls")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phone_calls" },
        (payload) => {
          console.log("Calls change:", payload);
          queryClient.invalidateQueries({ queryKey: ["phone_calls"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-calls"] });
        }
      )
      .subscribe();

    // Subscribe to conversations changes
    const conversationsChannel = supabase
      .channel("realtime-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          console.log("Conversations change:", payload);
          queryClient.invalidateQueries({ queryKey: ["lead-conversation"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(loadsChannel);
      supabase.removeChannel(callsChannel);
      supabase.removeChannel(conversationsChannel);
    };
  }, [queryClient]);
};
