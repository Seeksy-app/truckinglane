console.log('[TruckingLane] Trucker Tools interceptor injected');
/**
 * Injects truckertools-page-hook.js (page context). Listens for tt_loads_captured and forwards
 * { meta, data } to the service worker. Field mapping → Supabase columns and POST to
 * Mapping: truckertools-tt-map.js (mapTruckerToolsResponseToLoads). [TT MAP] log here before sendMessage;
 * VPS POST in background.js (pushTruckerToolsLoadsToVps).
 */
(function initTruckerToolsInterceptor() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("truckertools-page-hook.js");
  (document.head || document.documentElement).appendChild(script);

  document.addEventListener(
    "tt_loads_captured",
    (event) => {
      if (event.detail?.data?.[0] != null) {
        console.log(
          "[TruckingLane] Sample load raw:",
          JSON.stringify(event.detail.data[0], null, 2)
        );
      }
      const d = event.detail || {};
      console.log(
        "[TruckingLane] Event received, load count:",
        event.detail?.data?.length
      );

      const url = typeof d.url === "string" ? d.url : "";
      const authorization = d.authorization ?? null;
      const json = {
        meta: d.meta,
        data: d.data,
      };

      try {
        const mappedLoads = mapTruckerToolsResponseToLoads(json);
        if (mappedLoads[0] != null) {
          console.log(
            "[TT MAP] First mapped load:",
            JSON.stringify(mappedLoads[0], null, 2)
          );
        }
      } catch (e) {
        console.warn("[TT MAP] map failed:", e);
      }

      console.log("[TruckingLane] Posting to VPS...");
      try {
        chrome.runtime.sendMessage(
          {
            action: "truckertools-intercepted",
            url,
            authorization,
            json,
          },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              console.warn("[truckertools] sendMessage failed:", err.message);
              return;
            }
            if (response && response.ok === false) {
              console.log("[TruckingLane] VPS response:", response.error || "error");
              return;
            }
            console.log("[TruckingLane] VPS response:", response?.status);
          }
        );
      } catch (err) {
        console.warn("[truckertools] sendMessage failed:", err);
      }
    },
    true
  );
})();
