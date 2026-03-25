import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { DollarSign } from "lucide-react";

export function CostBadge() {
  const { role } = useUserRole();
  const isAdmin = role === "agency_admin" || role === "super_admin";

  const { data } = useQuery({
    queryKey: ["cost-badge"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${supabaseUrl}/functions/v1/get-cost-stats`, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
      });
      if (!resp.ok) return null;
      return await resp.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  if (!isAdmin || !data) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1">
      <DollarSign className="h-3 w-3 text-green-500" />
      <span className="font-medium text-foreground">${data.monthly.toFixed(2)}</span>
      <span>/mo</span>
      <span className="text-muted-foreground/60 mx-1">•</span>
      <span>${data.daily.toFixed(2)}</span>
      <span>/day</span>
    </div>
  );
}
