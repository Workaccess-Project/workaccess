// /frontend/js/wa_nav.js
(function () {
  const KEY = "wa_nav_focus";
  const TTL_MS = 10 * 60 * 1000; // 10 minut

  function set(focus, from = "unknown") {
    // "none" neukládáme vůbec
    if (!focus || focus === "none") {
      localStorage.removeItem(KEY);
      return;
    }
    const payload = { focus: String(focus), ts: Date.now(), from: String(from) };
    localStorage.setItem(KEY, JSON.stringify(payload));
  }

  // Vrátí focus jen jednou a hned ho smaže
  function consume() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    localStorage.removeItem(KEY);

    try {
      const payload = JSON.parse(raw);
      if (!payload || typeof payload.focus !== "string") return null;

      if (typeof payload.ts === "number" && Date.now() - payload.ts > TTL_MS) {
        return null; // moc staré
      }
      return payload.focus;
    } catch {
      // fallback pro starý formát (string)
      return raw;
    }
  }

  window.WA_NAV = { set, consume };
})();
