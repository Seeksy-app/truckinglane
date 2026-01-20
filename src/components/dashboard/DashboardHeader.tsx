import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, BarChart3, Truck } from "lucide-react";
import { Link } from "react-router-dom";

export const DashboardHeader = () => {
  const { signOut, user } = useAuth();

  // Fetch user profile for name
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Agent";

  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-[hsl(25,95%,53%)] flex items-center justify-center">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Trucking Lane
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{displayName}</span>
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          asChild
          className="gap-2"
        >
          <Link to="/analytics">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </div>
  );
};
