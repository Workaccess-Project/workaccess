(() => {
  function safeString(v) {
    return (v ?? "").toString().trim();
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // --- STATE LINE ---

  // kind: "loading" | "ok" | "error" | "info"
  function setState(el, kind = "info", text = "") {
    if (!el) return;
    const k = safeString(kind) || "info";
    const t = safeString(text);

    el.classList.add("waState");
    el.classList.remove("waState--loading", "waState--ok", "waState--error", "waState--info");
    el.classList.add(`waState--${k}`);

    if (t) {
      el.innerHTML = esc(t);
    } else {
      el.innerHTML =
        k === "loading" ? "Naèítám…" :
        k === "ok" ? "OK" :
        k === "error" ? "Chyba" :
        "—";
    }
  }

  // --- EMPTY STATE ---

  function renderEmpty(el, title = "Zatím nic", hint = "") {
    if (!el) return;
    const t = safeString(title) || "Zatím nic";
    const h = safeString(hint);

    el.innerHTML = `
      <div class="waEmpty">
        <div class="waEmpty__title">${esc(t)}</div>
        ${h ? `<div class="waEmpty__hint">${esc(h)}</div>` : ""}
      </div>
    `;
  }

  // --- FRIENDLY ERRORS ---

  function friendlyError(e) {
    const status = Number(e?.status || 0) || 0;
    const code = safeString(e?.code || e?.body?.error || "");
    const raw = safeString(e?.message || e);

    // Billing gate (vìtšinou øeší api.js redirect, ale pro allowlisted stránky chceme text)
    if (status === 402 || code === "TrialExpired" || raw.includes("TrialExpired")) {
      return "Trial vypršel. Nìkteré funkce mohou být uzamèené. Otevøi Billing a aktivuj tarif.";
    }

    // RBAC / Auth
    if (status === 403) return "Nemáš oprávnìní pro tuto akci (403).";
    if (status === 401) return "Nejsi pøihlášen (401). Zkus se znovu pøihlásit.";
    if (status === 404) return "Požadovaný endpoint nebyl nalezen (404).";
    if (status >= 500) return "Chyba serveru. Zkus to prosím za chvíli znovu.";

    // Network / fetch fail
    if (!status && (raw.includes("Failed to fetch") || raw.includes("NetworkError"))) {
      return "Nelze se spojit se serverem. Je backend spuštìný na http://localhost:3000 ?";
    }

    // Default
    return raw || "Neznámá chyba.";
  }

  // --- TENANT GUARDS ---

  function getCompanyId() {
    // preferuj WA_NAV, pokud existuje
    if (window.WA_NAV && typeof window.WA_NAV.getCompanyId === "function") {
      const cid = safeString(window.WA_NAV.getCompanyId());
      if (cid) return cid;
    }
    return safeString(localStorage.getItem("wa_company_id"));
  }

  function requireCompanyId() {
    const cid = getCompanyId();
    if (cid) return { ok: true, companyId: cid };

    return {
      ok: false,
      companyId: "",
      message:
        "Chybí companyId (tenant). Pøihlas se pøes login.html nebo nastav wa_company_id do localStorage.",
    };
  }

  window.WA_UI_STATE = {
    setState,
    renderEmpty,
    friendlyError,
    requireCompanyId,
    esc,
  };
})();
