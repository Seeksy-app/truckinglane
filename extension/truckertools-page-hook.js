/* Page context — loaded via chrome-extension://…/truckertools-page-hook.js (CSP-safe). */
(function () {
  if (window.__TL_TRUCKERTOOLS_FETCH_HOOK__) return;
  window.__TL_TRUCKERTOOLS_FETCH_HOOK__ = true;

  const _originalFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await _originalFetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
    if (url && url.includes("getNearbyLoadsV5")) {
      const input = args[0];
      const init = args[1];
      let authorization = null;
      try {
        if (init && init.headers) {
          const h = init.headers;
          if (typeof Headers !== "undefined" && h instanceof Headers) {
            authorization = h.get("Authorization") || h.get("authorization");
          } else if (Array.isArray(h)) {
            for (let i = 0; i < h.length; i++) {
              if (String(h[i][0]).toLowerCase() === "authorization") {
                authorization = h[i][1];
                break;
              }
            }
          } else if (typeof h === "object") {
            authorization = h.Authorization || h.authorization;
          }
        }
        if (
          !authorization &&
          typeof Request !== "undefined" &&
          input instanceof Request
        ) {
          authorization =
            input.headers.get("Authorization") ||
            input.headers.get("authorization");
        }
      } catch (_e) {
        /* ignore */
      }

      const clone = response.clone();
      clone
        .json()
        .then((responseJson) => {
          document.dispatchEvent(
            new CustomEvent("tt_loads_captured", {
              bubbles: true,
              detail: {
                data: responseJson.data,
                url,
                authorization,
              },
            }),
          );
        })
        .catch(() => {});
    }
    return response;
  };
})();
