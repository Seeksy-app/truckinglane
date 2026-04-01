console.log('[TruckingLane] Trucker Tools interceptor injected');
/**
 * Injects truckertools-page-hook.js into the page (chrome-extension:// URL — CSP-safe).
 * Relays tt_loads_captured to the service worker.
 */
(function initTruckerToolsInterceptor() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("truckertools-page-hook.js");
  (document.head || document.documentElement).appendChild(script);

  document.addEventListener(
    "tt_loads_captured",
    (event) => {
      const d = event.detail || {};
      const json = d.json !== undefined ? d.json : d;
      const url = d.url ?? "";
      const authorization = d.authorization ?? null;
      console.log("[TruckingLane] Captured loads:", json);
      try {
        chrome.runtime.sendMessage({
          action: "truckertools-intercepted",
          url,
          authorization,
          json,
        });
      } catch (err) {
        console.warn("[truckertools] sendMessage failed:", err);
      }
    },
    true
  );
})();
