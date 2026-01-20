import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useUserRole } from "@/hooks/useUserRole";

type Load = Tables<"loads">;

export function useLoads() {
  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { impersonatedAgencyId } = useImpersonation();
  const { role } = useUserRole();

  const fetchLoads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("loads")
        .select("*")
        .eq("is_active", true)
        .order("ship_date", { ascending: true });

      // If super admin is impersonating, filter by the impersonated agency
      if (role === 'super_admin' && impersonatedAgencyId) {
        query = query.eq("agency_id", impersonatedAgencyId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setLoads(data || []);
    } catch (err) {
      console.error("Error fetching loads:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch loads");
    } finally {
      setLoading(false);
    }
  }, [role, impersonatedAgencyId]);

  useEffect(() => {
    fetchLoads();
  }, [fetchLoads]);

  return { loads, loading, error, refetch: fetchLoads };
}
