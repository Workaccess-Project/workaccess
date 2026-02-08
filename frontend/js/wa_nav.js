// frontend/js/wa_nav.js
// Společná navigace + role (DEMO). Bez bundleru – vše na window.

(() => {
  const LS_ROLE = "workaccess.role";

  const ROLE_LABELS = {
    hr: "HR",
    security: "Bezpečnost",
    manager: "Manažer",
    external: "Externista",
  };

  function getRole() {
    return localStorage.getItem(LS_ROLE) || "hr";
  }

  function setRole(role) {
    localStorage.setItem(LS_ROLE, role);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderNav(activeKey = "") {
    const role = getRole();
    const roleLabel = ROLE_LABELS[role] || role;

    const el = document.getElementById("wa-nav");
    if (!el) return;

    el.innerHTML = `
      <div class="waNav">
        <div class="waNav__left">
          <div class="waBrand">WORKACCESS</div>
          <a class="waLink ${activeKey === "dashboard" ? "isActive" : ""}" href="./dashboard.html">Dashboard</a>
          <a class="waLink ${activeKey === "employees" ? "isActive" : ""}" href="./employees.html">Zaměstnanci</a>
          <a class="waLink ${activeKey === "todo" ? "isActive" : ""}" href="./index.html">TODO</a>
        </div>

        <div class="waNav__right">
          <span class="waRoleLabel">Role:</span>
          <span class="waRolePill" id="waRolePill">${escapeHtml(roleLabel)}</span>
          <button class="waBtn" id="waBtnRole">Změnit roli</button>
        </div>
      </div>
    `;

    const btn = document.getElementById("waBtnRole");
    btn?.addEventListener("click", () => openRoleModal());
  }

  function openRoleModal() {
    const current = getRole();

    const back = document.createElement("div");
    back.className = "waModalBack";
    back.innerHTML = `
      <div class="waModal">
        <div class="waModal__head">
          <strong>Vyber roli (DEMO)</strong>
          <button class="waIconBtn" id="waClose" title="Zavřít">✕</button>
        </div>
        <div class="waModal__body">
          <p>Demo přihlášení. Zatím se role ukládá do localStorage a posílá se do backendu přes hlavičku <code>x-role</code>.</p>
          <select id="waRoleSelect">
            <option value="hr">HR</option>
            <option value="security">Bezpečnost</option>
            <option value="manager">Manažer</option>
            <option value="external">Externista</option>
          </select>
        </div>
        <div class="waModal__foot">
          <button class="waBtn" id="waCancel">Zrušit</button>
          <button class="waBtn waBtn--primary" id="waApply">Použít roli</button>
        </div>
      </div>
    `;

    document.body.appendChild(back);

    const sel = back.querySelector("#waRoleSelect");
    sel.value = current;

    const close = () => back.remove();

    back.addEventListener("click", (e) => {
      if (e.target === back) close();
    });

    back.querySelector("#waClose")?.addEventListener("click", close);
    back.querySelector("#waCancel")?.addEventListener("click", close);

    back.querySelector("#waApply")?.addEventListener("click", () => {
      const next = sel.value || "hr";
      setRole(next);
      close();
      // refresh celé stránky, aby se znovu načetl /api/me a RBAC
      location.reload();
    });

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
  }

  window.WA_NAV = { renderNav, getRole, setRole };
})();
