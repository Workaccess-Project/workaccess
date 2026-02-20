// frontend/js/wa_nav.js
// Jednoduchá navigace + role switch (DEMO) + companyId storage.
// Musí být kompatibilní s backendem (x-role / x-company-id) a s frontend/api.js.

(() => {
  function safeString(v) {
    return (v ?? "").toString().trim();
  }

  const ROLE_ORDER = ["external", "hr", "manager", "security"];

  function getRole() {
    return safeString(localStorage.getItem("wa_role_key")) || "external";
  }

  function setRole(roleKey) {
    const r = safeString(roleKey) || "external";
    localStorage.setItem("wa_role_key", r);
    return r;
  }

  function cycleRole() {
    const cur = getRole();
    const idx = ROLE_ORDER.indexOf(cur);
    const next = ROLE_ORDER[(idx >= 0 ? idx + 1 : 0) % ROLE_ORDER.length];
    setRole(next);
    return next;
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

    const role = getRole();

    root.innerHTML = `
      <div class="nav" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <span class="pill" style="font-weight:700;">WORKACCESS</span>
          ${link("Dashboard", "./dashboard.html", "dashboard", activeKey)}
          ${link("Zaměstnanci", "./employees.html", "employees", activeKey)}
          ${link("TODO", "./index.html", "todo", activeKey)}
          ${link("Compliance", "./compliance.html", "compliance", activeKey)}
          ${link("Audit", "./audit.html", "audit", activeKey)}
          ${link("Billing", "./billing.html", "billing", activeKey)}
        </div>

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <span class="small" style="opacity:.8;">Role:</span>
          <span class="pill">${esc(roleLabel(role))}</span>
          <button id="waRoleBtn">Změnit roli</button>
        </div>
      </div>
    `;

    const btn = document.getElementById("waRoleBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        cycleRole();
        location.reload();
      });
    }
  }

  window.WA_NAV = {
    renderNav,
    getRole,
    setRole,
    getCompanyId,
    setCompanyId,
  };
})();