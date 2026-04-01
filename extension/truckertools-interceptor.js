console.log('[TruckingLane] Trucker Tools interceptor injected');
/**
 * Trucker Tools — runs in the content-script world; injects fetch wrapper into the *page* world
 * via an inline <script> so hooks see real page fetches. Bridges to the service worker with postMessage
 * (page CustomEvents do not reach this isolated world).
 */
(function initTruckerToolsInterceptor() {
  const MSG_TYPE = 'TL_TRUCKERTOOLS_NEARBY';

  const pageFetchHookSource = `(function () {
  if (window.__TL_TRUCKERTOOLS_FETCH_HOOK__) return;
  window.__TL_TRUCKERTOOLS_FETCH_HOOK__ = true;
  var _originalFetch = window.fetch.bind(window);
  window.fetch = async function () {
    var args = arguments;
    var input = args[0];
    var init = args[1];
    var url = "";
    try {
      if (typeof input === "string") url = input;
      else if (input && typeof input === "object" && "url" in input) url = String(input.url);
    } catch (e) {}
    var response = await _originalFetch.apply(this, args);
    if (!url || url.indexOf("getNearbyLoadsV5") === -1) return response;
    var auth = null;
    try {
      if (init && init.headers) {
        var h = init.headers;
        if (typeof Headers !== "undefined" && h instanceof Headers) {
          auth = h.get("Authorization") || h.get("authorization");
        } else if (Array.isArray(h)) {
          for (var i = 0; i < h.length; i++) {
            if (String(h[i][0]).toLowerCase() === "authorization") {
              auth = h[i][1];
              break;
            }
          }
        } else if (typeof h === "object") {
          auth = h.Authorization || h.authorization;
        }
      }
      if (!auth && typeof Request !== "undefined" && input instanceof Request) {
        auth = input.headers.get("Authorization") || input.headers.get("authorization");
      }
    } catch (e2) {}
    try {
      var clone = response.clone();
      clone
        .json()
        .then(function (data) {
          window.postMessage(
            { type: "${MSG_TYPE}", url: url, authorization: auth, json: data },
            "*"
          );
          try {
            window.dispatchEvent(new CustomEvent("tt_loads_captured", { detail: data }));
          } catch (e3) {}
        })
        .catch(function () {});
    } catch (e4) {}
    return response;
  };
})();`;

  try {
    const script = document.createElement('script');
    script.textContent = pageFetchHookSource;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (e) {
    console.warn('[truckertools] failed to inject page fetch hook:', e);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== MSG_TYPE) return;
    console.log('[TruckingLane] Captured loads:', event.data.json);
    try {
      chrome.runtime.sendMessage({
        action: 'truckertools-intercepted',
        url: event.data.url,
        authorization: event.data.authorization || null,
        json: event.data.json,
      });
    } catch (err) {
      console.warn('[truckertools] sendMessage failed:', err);
    }
  });
})();
