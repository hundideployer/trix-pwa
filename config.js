/* ============================================================================
 * Trix frontend configuration
 * ----------------------------------------------------------------------------
 * >>> THE ONE LINE TO EDIT WHEN YOU HOST THE API IS `API_BASE` BELOW. <<<
 *
 * Set API_BASE to the public origin of the Trix API. Give the ORIGIN ONLY —
 * no trailing slash and no "/api/v1" (the app appends "/api/v1" itself).
 *
 *   API_BASE: "https://api.trix.example.com"    // your hosted API
 *   API_BASE: "https://trix-api.onrender.com"   // any HTTPS origin
 *   API_BASE: "http://localhost:8000"           // local API
 *   API_BASE: ""                                // same-origin fallback
 *
 * Leave it as "" when the API itself serves this bundle at /app (local dev, or
 * a container host running the full stack): the app then calls
 * <current origin>/api/v1, which is exactly the old behaviour.
 *
 * A per-device override saved in the app's Settings sheet still wins over this
 * file, so a tester can repoint the app without a redeploy.
 * ==========================================================================*/
window.TRIX_API_BASE = "";

/* ---------------------------------------------------------------------------
 * Shared resolver — used by BOTH apps (Trix and Tiki Talker).
 * Do not edit below this line.
 * -------------------------------------------------------------------------*/
window.TRIX_API_PATH = "/api/v1";

window.trixResolveApiRoot = function (override) {
  var API_PATH = window.TRIX_API_PATH || "/api/v1";

  function normalize(value) {
    var v = String(value == null ? "" : value).trim().replace(/\/+$/, "");
    if (!v) return "";
    if (!/^https?:\/\//i.test(v)) {
      // Bare host: localhost/127.0.0.1 -> http, anything else -> https.
      var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(v);
      v = (isLocal ? "http://" : "https://") + v;
    }
    if (v.slice(-API_PATH.length) !== API_PATH) v += API_PATH;
    return v;
  }

  var o = normalize(override);
  if (o) return o;                                   // Settings override wins
  var c = normalize(window.TRIX_API_BASE);
  if (c) return c;                                   // config.js value
  return location.origin.replace(/\/+$/, "") + API_PATH;  // same-origin
};
