/**
 * Trucker Tools (oldcastle.truckertools.com) — intercept getNearbyLoadsV5 fetch responses.
 * Loads a page-world script (fetch wrapper) from web_accessible_resources and relays to SW.
 */
(function initTruckerToolsInterceptor() {
  const MSG_TYPE = "TL_TRUCKERTOOLS_NEARBY";

  try {
    const pageScript = document.createElement("script");
    pageScript.src = chrome.runtime.getURL("truckertools-page-hook.js");
    pageScript.onload = () => pageScript.remove();
    (document.documentElement || document.head).appendChild(pageScript);
  } catch (e) {
    console.warn("[truckertools] failed to inject page hook:", e);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== MSG_TYPE) return;
    try {
      chrome.runtime.sendMessage({
        action: "truckertools-intercepted",
        url: event.data.url,
        authorization: event.data.authorization || null,
        json: event.data.json,
      });
    } catch (e) {
      console.warn("[truckertools] sendMessage failed:", e);
    }
  });
})();
