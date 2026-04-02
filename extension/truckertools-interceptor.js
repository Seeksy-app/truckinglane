/**
 * Injects truckertools-page-hook.js (page context). Listens for tt_loads_captured and forwards
 * loads + url to the service worker for mapTruckerToolsResponseToLoads + VPS insert.
 */
(function initTruckerToolsInterceptor() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("truckertools-page-hook.js");
  (document.head || document.documentElement).appendChild(script);

  document.addEventListener(
    "tt_loads_captured",
    (event) => {
      const d = event.detail || {};
      const loads = d.data;
      const url = typeof d.url === "string" ? d.url : "";

      try {
        chrome.runtime.sendMessage(
          {
            action: "truckertools-intercepted",
            loads: Array.isArray(loads) ? loads : [],
            url,
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
            console.log("[TruckingLane] TT intercept VPS:", response?.status, "loads:", loads?.length);
          },
        );
      } catch (err) {
        console.warn("[truckertools] sendMessage failed:", err);
      }
    },
    true,
  );
})();
