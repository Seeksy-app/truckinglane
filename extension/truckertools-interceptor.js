console.log('[TruckingLane] Trucker Tools interceptor injected');
/**
 * Injects truckertools-page-hook.js into the page (real extension URL — avoids CSP on inline scripts).
 * Relays tt_loads_captured (dispatched on document in the page world) to the service worker.
 */
(function initTruckerToolsInterceptor() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("truckertools-page-hook.js");
    script.onload = () => {
      console.log("[TruckingLane] Trucker Tools hook loaded");
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.warn("[truckertools] failed to inject page hook:", e);
  }

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
