import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const PING_INTERVAL = 15 * 60 * 1000; // 15 minutes
const PING_ENDPOINT = "https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/tracking-ping";

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"requesting" | "active" | "denied" | "error">("requesting");
  const [lastPing, setLastPing] = useState<Date | null>(null);

  const sendPing = useCallback((position: GeolocationPosition) => {
    if (!token) return;
    fetch(PING_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        setStatus("active");
        setLastPing(new Date());
      })
      .catch(() => setStatus("error"));
  }, [token]);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        sendPing(pos);
        intervalId = setInterval(() => {
          if (cancelled) return;
          navigator.geolocation.getCurrentPosition(sendPing, () => {
            if (!cancelled) setStatus("denied");
          });
        }, PING_INTERVAL);
      },
      () => {
        if (!cancelled) setStatus("denied");
      },
    );

    return () => {
      cancelled = true;
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [token, sendPing]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🚛</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">D&L Transport</h1>
        <p className="text-gray-500 mb-6">Load Tracking</p>

        {status === "requesting" && (
          <>
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Requesting location access...</p>
          </>
        )}

        {status === "active" && (
          <>
            <div className="w-4 h-4 bg-green-500 rounded-full mx-auto mb-4 animate-pulse" />
            <p className="text-green-600 font-semibold">Location sharing active</p>
            <p className="text-gray-400 text-sm mt-2">
              Keep this page open while driving.
              {lastPing && ` Last update: ${lastPing.toLocaleTimeString()}`}
            </p>
            <p className="text-gray-400 text-xs mt-4">
              Your location is shared with D&L Transport only.
              Updates every 15 minutes.
            </p>
          </>
        )}

        {status === "denied" && (
          <>
            <p className="text-red-500 font-semibold">Location access denied</p>
            <p className="text-gray-500 text-sm mt-2">
              Please enable location in your browser settings and refresh this page.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <p className="text-red-500 font-semibold">Something went wrong</p>
            <p className="text-gray-500 text-sm mt-2">
              {!token
                ? "This tracking link is invalid."
                : "Could not send your location. Check your connection and try again."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
