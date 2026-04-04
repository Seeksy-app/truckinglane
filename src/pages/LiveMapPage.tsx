import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { AppHeader } from "@/components/AppHeader";
import { loadGoogleMapsScript } from "@/lib/loadGoogleMaps";
import { formatPhone } from "@/lib/utils";
import { formatCityState } from "@/components/loads/LoadNotes";
import { format } from "date-fns";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

type MapRow = {
  session_id: string;
  token: string;
  driver_phone: string | null;
  last_ping_at: string | null;
  session_status: string;
  load_number: string;
  pickup_city: string | null;
  pickup_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  ping_lat: number | null;
  ping_lng: number | null;
  ping_at: string | null;
};

function markerColorForPing(pingAtIso: string | null): string {
  if (!pingAtIso) return "#ef4444";
  const mins = (Date.now() - new Date(pingAtIso).getTime()) / 60_000;
  if (mins <= 30) return "#22c55e";
  if (mins <= 60) return "#eab308";
  return "#ef4444";
}

export default function LiveMapPage() {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { role, agencyId, loading: roleLoading } = useUserRole();
  const { impersonatedAgencyId, isImpersonating } = useImpersonation();
  const effectiveAgencyId = isImpersonating ? impersonatedAgencyId : agencyId;

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  const canAccess =
    role === "agent" || role === "agency_admin" || role === "super_admin";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["live-map-tracking", effectiveAgencyId],
    queryFn: async () => {
      if (!effectiveAgencyId) return [];
      const { data, error } = await supabase.rpc("get_active_tracking_for_map", {
        p_agency_id: effectiveAgencyId,
      });
      if (error) throw error;
      return (data ?? []) as MapRow[];
    },
    enabled: !!user && !!effectiveAgencyId && canAccess,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const plotted = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.ping_lat != null &&
          r.ping_lng != null &&
          !Number.isNaN(r.ping_lat) &&
          !Number.isNaN(r.ping_lng),
      ),
    [rows],
  );

  const renderMarkers = useCallback(() => {
    const g = window.google?.maps;
    const map = googleMapRef.current;
    if (!g || !map) return;

    for (const m of markersRef.current) {
      m.setMap(null);
    }
    markersRef.current = [];

    if (!infoWindowRef.current) {
      infoWindowRef.current = new g.InfoWindow();
    }
    const iw = infoWindowRef.current;

    const bounds = new g.LatLngBounds();
    let any = false;

    for (const r of plotted) {
      const lat = r.ping_lat as number;
      const lng = r.ping_lng as number;
      const pingRef = r.ping_at || r.last_ping_at;
      const color = markerColorForPing(pingRef);
      const pos = { lat, lng };

      const marker = new g.Marker({
        map,
        position: pos,
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      any = true;

      const origin = formatCityState(r.pickup_city, r.pickup_state) || "—";
      const dest = formatCityState(r.dest_city, r.dest_state) || "—";
      const phoneLine = r.driver_phone ? formatPhone(r.driver_phone) : "—";
      const pingLabel = pingRef
        ? format(new Date(pingRef), "MMM d, h:mm a")
        : "Never";

      const html = `
        <div style="font-family: system-ui,sans-serif;max-width:240px;padding:4px;">
          <div style="font-weight:700;margin-bottom:6px;">Load #${escapeHtml(r.load_number)}</div>
          <div style="font-size:13px;line-height:1.4;">
            <div><strong>Driver</strong> ${escapeHtml(phoneLine)}</div>
            <div><strong>Last ping</strong> ${escapeHtml(pingLabel)}</div>
            <div><strong>Route</strong> ${escapeHtml(origin)} → ${escapeHtml(dest)}</div>
          </div>
        </div>`;

      marker.addListener("click", () => {
        iw.setContent(html);
        iw.open({ map, anchor: marker });
      });
    }

    if (any) {
      map.fitBounds(bounds);
      g.event.addListenerOnce(map, "bounds_changed", () => {
        const z = map.getZoom();
        if (z != null && z > 14) map.setZoom(14);
      });
    }
  }, [plotted]);

  useEffect(() => {
    if (!apiKey || !mapRef.current || authLoading || roleLoading) return;

    let cancelled = false;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const g = window.google!.maps;
        googleMapRef.current = new g.Map(mapRef.current, {
          center: { lat: 39.8283, lng: -98.5795 },
          zoom: 4,
          mapTypeControl: false,
          streetViewControl: false,
        });
        setMapsReady(true);
        setMapsError(null);
      })
      .catch((e) => {
        setMapsError(e instanceof Error ? e.message : "Maps failed to load");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, authLoading, roleLoading]);

  useEffect(() => {
    if (!mapsReady || !googleMapRef.current) return;
    renderMarkers();
  }, [mapsReady, renderMarkers, rows]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!role || !canAccess) {
    return <Navigate to="/access-denied" replace />;
  }

  if (!effectiveAgencyId) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-screen-2xl mx-auto tl-page-gutter py-12 text-center">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-xl font-semibold text-foreground">Live Map</h1>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            {role === "super_admin"
              ? "Impersonate an agency from the platform menu to view driver locations for that brokerage."
              : "No agency is associated with your account."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col max-w-screen-2xl w-full mx-auto tl-page-gutter py-6 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Live Map</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Active driver tracking sessions · Refreshes every 5 minutes
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ["live-map-tracking", effectiveAgencyId] })
            }
          >
            Refresh now
          </Button>
        </div>

        {!apiKey && (
          <p className="text-sm text-destructive">
            Missing VITE_GOOGLE_MAPS_API_KEY — add it to your environment to show the map.
          </p>
        )}
        {mapsError && <p className="text-sm text-destructive">{mapsError}</p>}

        <div className="relative rounded-xl border border-border overflow-hidden bg-muted/30 min-h-[min(70vh,560px)] flex-1">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <div ref={mapRef} className="w-full h-full min-h-[min(70vh,560px)]" />

          {!isLoading && rows.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-muted-foreground bg-card/95 border border-border px-6 py-4 rounded-lg shadow-sm">
                No drivers currently being tracked
              </p>
            </div>
          )}

          {!isLoading && rows.length > 0 && plotted.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-muted-foreground bg-card/95 border border-border px-6 py-4 rounded-lg shadow-sm text-center max-w-sm">
                No location pings yet. Markers appear after drivers open their tracking link and share
                location.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-[#22c55e]" /> Pinged in last 30 min
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-[#eab308]" /> 30–60 min ago
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-[#ef4444]" /> Over 60 min / no ping
          </span>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
