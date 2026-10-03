/* Tiki Talker PWA — record & play voice notes, stored locally (IndexedDB-free:
 * blobs kept in memory + object URLs; notes persist for the session).
 * Works fully offline once installed.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // Shared API base (single source of truth: frontend/config.js).
  // Tiki Talker makes no API calls today; this is wired for parity.
  const apiBase = () =>
    (window.trixResolveApiRoot ? window.trixResolveApiRoot("") : location.origin + "/api/v1");
  console.log("[tiki] API base = " + apiBase());

  let mediaRecorder = null, chunks = [], stream = null;
  let timerId = null, seconds = 0;
  const notes = [];

  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const fmt = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

  function renderNotes() {
    const el = $("notes");
    if (!notes.length) { el.innerHTML = '<li class="empty">No voice notes yet.</li>'; return; }
    el.innerHTML = notes.map((n, i) => `
      <li>
        <div class="row">
          <div>
            <div class="name">${n.name}</div>
            <div class="meta">${n.duration} · ${n.when}</div>
          </div>
          <button class="del" data-i="${i}" aria-label="Delete">🗑</button>
        </div>
        <audio controls src="${n.url}"></audio>
      </li>`).join("");
    el.querySelectorAll(".del").forEach((b) =>
      b.addEventListener("click", () => {
        const i = +b.dataset.i;
        URL.revokeObjectURL(notes[i].url);
        notes.splice(i, 1); renderNotes();
      }));
  }

  async function start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      return toast("Recording is not supported in this browser");
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      return toast("Microphone permission denied");
    }
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      notes.unshift({
        name: "Voice note " + (notes.length + 1),
        duration: fmt(seconds),
        when: new Date().toLocaleTimeString(),
        url: URL.createObjectURL(blob),
      });
      renderNotes();
      stream.getTracks().forEach((t) => t.stop());
    };
    mediaRecorder.start();
    seconds = 0; $("timer").textContent = "00:00";
    $("pulse").classList.add("rec");
    $("hint").textContent = "Recording… tap Stop when you are done.";
    $("record-btn").hidden = true; $("stop-btn").hidden = false;
    timerId = setInterval(() => { seconds++; $("timer").textContent = fmt(seconds); }, 1000);
  }

  function stop() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    clearInterval(timerId);
    $("pulse").classList.remove("rec");
    $("hint").textContent = "Saved. Tap the mic to record another.";
    $("record-btn").hidden = false; $("stop-btn").hidden = true;
    toast("Voice note saved");
  }

  // install prompt
  let deferredPrompt = null;
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredPrompt = e;
    if (!isStandalone()) $("install-btn").hidden = false;
  });
  window.addEventListener("appinstalled", () => { $("install-btn").hidden = true; toast("Tiki Talker installed 🎉"); });
  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null; $("install-btn").hidden = true;
    } else if (isIOS()) toast("iPhone: tap Share ⬆ then “Add to Home Screen”");
    else toast("Open your browser menu (⋮) → “Install app”");
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("sw.js").then(
        (r) => console.log("[tiki] SW registered:", r.scope),
        (e) => console.warn("[tiki] SW failed:", e)));
  }
  window.addEventListener("online", () => { $("offline-banner").hidden = true; });
  window.addEventListener("offline", () => { $("offline-banner").hidden = false; });

  $("record-btn").addEventListener("click", start);
  $("stop-btn").addEventListener("click", stop);
  $("install-btn").addEventListener("click", install);
  if (isStandalone()) $("install-btn").hidden = true;
  else if (isIOS()) $("install-btn").hidden = false;
  renderNotes();
})();
