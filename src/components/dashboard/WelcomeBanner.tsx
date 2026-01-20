import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWeather } from "@/hooks/useWeather";
import { Cloud, Sun, CloudRain } from "lucide-react";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function getFormattedDateTime(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }) + " • " + now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function WelcomeBanner() {
  const { user } = useAuth();
  const { weather, loading: weatherLoading } = useWeather();

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
  const firstName = displayName.split(" ")[0];

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-card via-card to-muted/30 border border-border p-5 mb-6">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(var(--safety-orange))]/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-1/2 w-24 h-24 bg-[hsl(var(--safety-orange))]/5 rounded-full translate-y-1/2" />
      
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            {getGreeting()}, <span className="text-[hsl(var(--safety-orange))]">{firstName}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {getFormattedDateTime()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Let's move some freight today!
          </p>
        </div>

        {/* Weather display */}
        {weather && !weatherLoading && (
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-lg border border-border/50">
            <span className="text-2xl">{weather.icon}</span>
            <div className="text-right">
              <p className="text-lg font-semibold text-foreground">
                {weather.temp}°F
              </p>
              <p className="text-xs text-muted-foreground">
                {weather.condition} • {weather.location}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
