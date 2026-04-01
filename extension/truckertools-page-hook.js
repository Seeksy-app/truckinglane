/* Page context — loaded via <script src="chrome-extension://..."> to avoid CSP blocking inline hooks. */
(function () {
  if (window.__TL_TRUCKERTOOLS_FETCH_HOOK__) return;
  window.__TL_TRUCKERTOOLS_FETCH_HOOK__ = true;
  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = "";
    try {
      if (typeof input === "string") url = input;
      else if (input && typeof input === "object" && "url" in input) url = String(input.url);
    } catch (e) {}
    var p = orig.apply(this, arguments);
    if (!url || url.indexOf("getNearbyLoadsV5") === -1) return p;

    return p.then(function (response) {
      try {
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

        var clone = response.clone();
        clone
          .json()
          .then(function (json) {
            window.postMessage(
              {
                type: "TL_TRUCKERTOOLS_NEARBY",
                url: url,
                authorization: auth,
                json: json,
              },
              "*"
            );
          })
          .catch(function () {});
      } catch (e) {}
      return response;
    });
  };
})();
