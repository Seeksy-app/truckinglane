import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getUserTimezone } from "@/lib/dateWindows";

/**
 * Hook to fetch and provide the user's timezone preference
 * Falls back to America/New_York if not set
 */
export function useUserTimezone() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-timezone", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const timezone = getUserTimezone(profile?.timezone);

  return {
    timezone,
    isLoading,
  };
}
