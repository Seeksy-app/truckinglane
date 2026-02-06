import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type DemoLoad = Tables<"demo_loads">;

export function useDemoLoads() {
  const [loads, setLoads] = useState<DemoLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDemoLoads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("demo_loads")
        .select("*")
        .eq("is_active", true)
        .eq("status", "open")
        .order("ship_date", { ascending: true });

      if (fetchError) throw fetchError;

      console.log(data);
      setLoads(data || []);
    } catch (err) {
      console.error("Error fetching demo loads:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch demo loads",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDemoLoads();
  }, [fetchDemoLoads]);

  return {
    loads,
    loading,
    error,
    refetch: fetchDemoLoads,
  };
}
