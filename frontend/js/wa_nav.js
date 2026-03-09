// frontend/js/wa_nav.js
// Produkce: JWT_ONLY → role se bere z JWT tokenu (wa_auth_token), role switch je vypnutý.
// Dev fallback: pokud token není, použije se wa_role_key (DEMO).
//
// BOX #82:
// - Přidáno tlačítko "Odhlásit" (jen když existuje JWT token)
// - Odhlášení smaže wa_auth_token + wa_company_id (+ demo role) a přesměruje na index.html
//
// BOX #104:
// - Přidán odkaz "Firma" do hlavní navigace

(() => {
  function safeString(v) {
    return (v ?? "").toString().trim();
  }

  const ROLE_ORDER = ["external", "hr", "manager", "security"];

  function getToken() {
    try {
      return safeString(localStorage.getItem("wa_auth_token"));
    } catch {
      return "";
    }
  }

  function clearAuthStorage() {
    try {
      localStorage.removeItem("wa_auth_token");
      localStorage.removeItem("wa_company_id");
      // DEMO role key – prevent confusion after logout
      localStorage.removeItem("wa_role_key");
    } catch {
      // ignore
    }
  }

  function parseJwtPayload(token) {
    try {
      const t = safeString(token);
      if (!t || !t.includes(".")) return null;
      const payload = t.split(".")[1];
      if (!payload) return null;

      const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
      const json = atob(b64 + pad);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function getDemoRole() {
    return safeString(localStorage.getItem("wa_role_key")) || "external";
  }

  function setDemoRole(roleKey) {
    const r = safeString(roleKey) || "external";
    localStorage.setItem("wa_role_key", r);
    return r;
  }

  function cycleDemoRole() {
    const cur = getDemoRole();
    const idx = ROLE_ORDER.indexOf(cur);
    const next = ROLE_ORDER[(idx >= 0 ? idx + 1 : 0) % ROLE_ORDER.length];
    setDemoRole(next);
    return next;
  }

  // Produkční role: z JWT, jinak fallback DEMO
  function getRole() {
    const tok = getToken();
    if (tok) {
      const p = parseJwtPayload(tok);
      const r = safeString(p?.role);
      if (r) return r;
    }
    return getDemoRole();
  }

  function getCompanyId() {
    return safeString(localStorage.getItem("wa_company_id"));
  }

  function setCompanyId(cid) {
    const v = safeString(cid);
    if (v) localStorage.setItem("wa_company_id", v);
    return v;
  }

  function roleLabel(roleKey) {
    const map = {
      admin: "Admin",
      hr: "HR",
      manager: "Manažer",
      security: "Bezpečnost",
      external: "Externista",
    };
    return map[roleKey] || roleKey;
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function link(label, href, key, activeKey) {
    const active = key === activeKey;
    return `<a href="${esc(href)}" class="${active ? "navActive" : ""}" style="text-decoration:none;">${esc(label)}</a>`;
  }

  function renderNav(activeKey = "") {
    const root = document.getElementById("wa-nav");
    if (!root) return;

    const tok = getToken();
    const role = getRole();

    root.innerHTML = `
      <div class="nav" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <span class="pill" style="font-weight:700;">WORKACCESS</span>
          ${link("Dashboard", "./dashboard.html", "dashboard", activeKey)}
          ${link("Firma", "./company.html", "company", activeKey)}
          ${link("Zaměstnanci", "./employees.html", "employees", activeKey)}
          ${link("TODO", "./index.html", "todo", activeKey)}
          ${link("Compliance", "./compliance.html", "compliance", activeKey)}
          ${link("Audit", "./audit.html", "audit", activeKey)}
          ${link("Billing", "./billing.html", "billing", activeKey)}
        </div>

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <span class="small" style="opacity:.8;">Role:</span>
          <span class="pill">${esc(roleLabel(role))}</span>

          ${
            tok
              ? `<button id="waLogoutBtn" title="Odhlásit">Odhlásit</button>`
              : `<button id="waRoleBtn" title="DEMO only">Změnit roli</button>`
          }
        </div>
      </div>
    `;

    // Logout jen když je token
    const logoutBtn = document.getElementById("waLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearAuthStorage();
        // redirect to a guaranteed existing page; unauth flow should kick in there
        window.location.href = "./index.html";
      });
    }

    // Role switch jen když není token (DEMO/dev)
    const btn = document.getElementById("waRoleBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        cycleDemoRole();
        location.reload();
      });
    }
  }

  window.WA_NAV = {
    renderNav,
    getRole,
    // setRole ponecháme pro zpětnou kompatibilitu, ale mění jen DEMO roli
    setRole: setDemoRole,
    getCompanyId,
    setCompanyId,
  };
})();
