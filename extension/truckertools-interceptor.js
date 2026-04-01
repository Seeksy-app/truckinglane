console.log('[TruckingLane] Trucker Tools interceptor injected');
/**
 * Injects truckertools-page-hook.js into the page (chrome-extension:// URL — CSP-safe).
 * Relays tt_loads_captured to the service worker, which maps loads and POSTs to VPS.
 */
(function initTruckerToolsInterceptor() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("truckertools-page-hook.js");
  (document.head || document.documentElement).appendChild(script);

  document.addEventListener(
    "tt_loads_captured",
    (event) => {
      const d = event.detail || {};
      console.log(
        "[TruckingLane] Event received, load count:",
        event.detail?.data?.length
      );
      if (event.detail?.data?.[0]) {
        console.log(
          "[TruckingLane] Sample load:",
          JSON.stringify(event.detail.data[0])
        );
      }

      const url = typeof d.url === "string" ? d.url : "";
      const authorization = d.authorization ?? null;
      const json = {
        meta: d.meta,
        data: d.data,
      };

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
