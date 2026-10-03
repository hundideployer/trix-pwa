/* Trix PWA — real API wiring (mint / validate / redeem / wallet).
 * Identity: dev-mode header auth (X-User-Email for users, X-Admin-Key for operators).
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---- API base resolution -------------------------------------------------
  // Single source of truth: frontend/config.js (window.TRIX_API_BASE).
  //   config.js set   -> that hosted origin + /api/v1
  //   config.js ""    -> same-origin <location.origin>/api/v1 (API serves /app)
  //   Settings sheet  -> per-device override, wins over config.js
  const resolveApiRoot = (override) => {
    if (typeof window.trixResolveApiRoot === "function") return window.trixResolveApiRoot(override);
    const o = String(override || "").trim().replace(/\/+$/, "");
    if (o) return o;
    return location.origin.replace(/\/+$/, "") + "/api/v1";
  };
  const apiBase = () => resolveApiRoot(store.get("trix.apiBase", ""));
  const userEmail = () => store.get("trix.userEmail", "");
  const adminKey = () => store.get("trix.adminKey", "");

  // ---- tiny UI helpers -----------------------------------------------------
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function showResult(el, ok, html) {
    el.className = "result " + (ok ? "ok" : "err");
    el.innerHTML = html; el.hidden = false;
  }
  const money = (cents) => "$" + (cents / 100).toFixed(2);

  // Loud, unmissable banner when the API base is unset/unreachable, so the app
  // never looks "fine but dead". Cleared as soon as a call succeeds.
  function showApiError(detail) {
    const b = $("api-error");
    if (!b) return;
    b.innerHTML =
      '<b>\u26a0 Can\u2019t reach the Trix API</b><br>' +
      (detail || "") +
      '<br><span class="muted small">Resolved API root: <code>' + apiBase() + "</code>" +
      ' \u2014 set <code>window.TRIX_API_BASE</code> in <code>config.js</code>, or override it in \u2699 Settings.</span>';
    b.hidden = false;
  }
  function clearApiError() { const b = $("api-error"); if (b) b.hidden = true; }

  // ---- API client ----------------------------------------------------------
  async function api(path, { method = "GET", body, admin = false } = {}) {
    const headers = { "Accept": "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (admin) {
      headers["X-Admin-Key"] = adminKey() || "dev-admin-key";
      headers["X-Operator-Id"] = "1";
    } else if (userEmail()) {
      headers["X-User-Email"] = userEmail();
    }
    const url = apiBase() + path;
    console.log("[trix] " + method + " " + url);
    let res;
    try {
      res = await fetch(url, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
      });
    } catch (netErr) {
      const msg = netErr && netErr.message ? netErr.message : "network error";
      showApiError("Network error: " + msg);
      const e2 = new Error("Network error \u2014 cannot reach " + apiBase());
      e2.status = 0; e2.network = true; throw e2;
    }
    clearApiError();
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const detail = (data && (data.detail || data.message)) || res.statusText;
      const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  // ---- views ---------------------------------------------------------------
  function switchView(name) {
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== "view-" + name; });
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
    if (name === "wallet") loadWallet();
  }

  async function loadWallet() {
    const el = $("ledger");
    if (!userEmail()) {
      $("balance-value").textContent = "$0.00";
      $("tier-chip").textContent = "\u2014";
      $("lifetime").textContent = "Lifetime $0.00";
      $("wallet-user").textContent = "Not signed in \u2014 open Settings to add your email";
      el.innerHTML = '<li class="empty">No activity yet.</li>';
      return;
    }
    $("wallet-user").textContent = userEmail();
    try {
      const w = await api("/wallet");
      $("balance-value").textContent = money(w.balance_cents);
      $("tier-chip").textContent = w.loyalty_tier || "\u2014";
      $("lifetime").textContent = "Lifetime " + money(w.lifetime_volume_cents || 0);
      const entries = w.recent_entries || [];
      el.innerHTML = entries.length
        ? entries.map((e) => `
            <li>
              <div>
                <div class="type">${e.entry_type.replace(/_/g, " ")}</div>
                <div class="meta">${new Date(e.created_at).toLocaleString()}</div>
              </div>
              <div class="amt">+${money(e.amount_cents)}</div>
            </li>`).join("")
        : '<li class="empty">No activity yet.</li>';
    } catch (e) {
      el.innerHTML = `<li class="empty">Could not load wallet: ${e.message}</li>`;
    }
  }

  async function doRedeem() {
    const code = $("redeem-code").value.trim();
    const out = $("redeem-result");
    if (!code) return toast("Enter a code first");
    if (!userEmail()) return toast("Add your email in Settings first");
    const btn = $("redeem-btn"); btn.disabled = true;
    try {
      const r = await api("/cards/redeem", { method: "POST", body: { code } });
      showResult(out, true,
        `<span class="big">+${money(r.amount_credited_cents)}</span>
         Redeemed ${r.denomination} \u2192 new balance ${money(r.new_balance_cents)}<br>
         Tier: <b>${r.loyalty_tier || "\u2014"}</b> \u00b7 Receipt <code>${r.receipt_id}</code>`);
      $("redeem-code").value = "";
      loadWallet();
    } catch (e) {
      showResult(out, false, `<b>Could not redeem</b><br>${e.message}`);
    } finally { btn.disabled = false; }
  }

  async function doValidate() {
    const code = $("validate-code").value.trim();
    const out = $("validate-result");
    if (!code) return toast("Enter a code first");
    const btn = $("validate-btn"); btn.disabled = true;
    try {
      const r = await api("/cards/validate?code=" + encodeURIComponent(code));
      if (r.valid) {
        showResult(out, true,
          `<span class="big">Valid \u2713</span>
           Status <b>${r.status}</b> \u00b7 Value <b>$${r.denomination}</b><br>
           Prefix <code>${r.prefix}</code> \u00b7 Expires ${r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "\u2014"}`);
      } else {
        showResult(out, false, `<b>Not valid</b><br>Reason: ${r.reason || "unknown"}`);
      }
    } catch (e) {
      showResult(out, false, `<b>Check failed</b><br>${e.message}`);
    } finally { btn.disabled = false; }
  }

  async function doMint() {
    const out = $("mint-result");
    const btn = $("mint-btn"); btn.disabled = true;
    try {
      const r = await api("/cards/batch", {
        method: "POST", admin: true,
        body: {
          denomination: String($("mint-denom").value),
          quantity: parseInt($("mint-qty").value, 10),
          notes: "minted from Trix PWA",
        },
      });
      showResult(out, true,
        `<span class="big">Batch #${r.batch_id}</span>
         ${r.quantity} \u00d7 $${r.denomination} \u00b7 status <b>${r.status}</b><br>
         Face value ${money(r.face_value_cents)} \u00b7 replayed: ${r.replayed}<br>
         <code>idempotency_key ${r.idempotency_key}</code>`);
    } catch (e) {
      showResult(out, false, `<b>Mint failed</b><br>${e.message}`);
    } finally { btn.disabled = false; }
  }

  // ---- settings ------------------------------------------------------------
  function openSheet() {
    $("api-base").value = apiBase();
    $("user-email").value = userEmail();
    $("admin-key").value = adminKey();
    $("sheet-backdrop").hidden = false;
  }
  function closeSheet() { $("sheet-backdrop").hidden = true; }
  function saveSettings() {
    store.set("trix.apiBase", $("api-base").value.trim());
    store.set("trix.userEmail", $("user-email").value.trim());
    store.set("trix.adminKey", $("admin-key").value.trim());
    closeSheet(); toast("Saved"); loadWallet();
  }
  async function testApi() {
    const out = $("api-status");
    try {
      const h = await api("/health");
      showResult(out, true, `Connected \u2713<br>status <b>${h.status}</b> \u00b7 version ${h.version} \u00b7 env ${h.env}`);
    } catch (e) {
      showResult(out, false, `No connection<br>${e.message}`);
    }
  }

  // ---- install prompt ------------------------------------------------------
  let deferredPrompt = null;
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredPrompt = e;
    if (!isStandalone()) $("install-btn").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null; $("install-btn").hidden = true; toast("Trix installed \ud83c\udf89");
  });
  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") toast("Installing\u2026");
      deferredPrompt = null; $("install-btn").hidden = true;
    } else if (isIOS()) {
      toast("iPhone: tap Share \u2b06 then \u201cAdd to Home Screen\u201d");
    } else {
      toast("Open your browser menu (\u22ee) \u2192 \u201cInstall app\u201d / \u201cAdd to Home screen\u201d");
    }
  }

  // ---- service worker ------------------------------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then(
        (reg) => console.log("[trix] SW registered:", reg.scope),
        (err) => console.warn("[trix] SW registration failed:", err)
      );
    });
  }
  window.addEventListener("online", () => { $("offline-banner").hidden = true; });
  window.addEventListener("offline", () => { $("offline-banner").hidden = false; });

  // ---- wire up -------------------------------------------------------------
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchView(t.dataset.view)));
  $("redeem-btn").addEventListener("click", doRedeem);
  $("validate-btn").addEventListener("click", doValidate);
  $("mint-btn").addEventListener("click", doMint);
  $("settings-btn").addEventListener("click", openSheet);
  $("sheet-close").addEventListener("click", closeSheet);
  $("sheet-backdrop").addEventListener("click", (e) => { if (e.target.id === "sheet-backdrop") closeSheet(); });
  $("save-settings").addEventListener("click", saveSettings);
  $("test-api").addEventListener("click", testApi);
  $("install-btn").addEventListener("click", install);
  $("redeem-code").addEventListener("keydown", (e) => { if (e.key === "Enter") doRedeem(); });
  $("validate-code").addEventListener("keydown", (e) => { if (e.key === "Enter") doValidate(); });

  // ---- boot diagnostics ----------------------------------------------------
  // Always surface which API this build talks to, so "it does nothing" is
  // never a mystery. Then probe /health and show the banner if it is down.
  (function bootDiagnostics() {
    const src = store.get("trix.apiBase", "")
      ? "Settings override"
      : (window.TRIX_API_BASE ? "config.js (window.TRIX_API_BASE)" : "config.js empty \u2192 same-origin fallback");
    const root = apiBase();
    console.log("[trix] API base = " + root + "  (source: " + src + ")");
    const chip = $("api-base-line");
    if (chip) chip.textContent = "API \u2192 " + root;

    if (!window.trixResolveApiRoot) {
      showApiError("config.js did not load \u2014 the app cannot resolve an API URL.");
      return;
    }
    if (!/^https?:\/\//.test(root)) {
      showApiError("Unset or invalid API base: <code>" + root + "</code>.");
      return;
    }
    api("/health").then((h) => {
      console.log("[trix] /health OK \u2014 status=" + h.status + " version=" + h.version);
      const chip = $("api-base-line");
      if (chip) chip.textContent = "API \u2713 " + root;
    }).catch((e) => {
      console.warn("[trix] /health failed:", e.message);
      showApiError("<code>/health</code> failed: " + e.message);
    });
  })();

  if (isStandalone()) $("install-btn").hidden = true;
  else if (isIOS()) $("install-btn").hidden = false; // iOS has no beforeinstallprompt
  loadWallet();
})();
