// frontend/js/wa_nav.js
// Společná navigace + role (DEMO). Bez bundleru – vše na window.

(() => {
  const LS_ROLE = "workaccess.portal.role";

  const ROLE_LABELS = {
    hr: "HR",
    security: "Bezpečnost",
    manager: "Manažer",
    external: "Externista",
  };

  function getRole() {
    return (localStorage.getItem(LS_ROLE) || "hr").toString();
  }

  function setRole(role) {
    localStorage.setItem(LS_ROLE, (role || "hr").toString());
  }

  function roleLabel(role = getRole()) {
    return ROLE_LABELS[role] || role;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function link(label, href, key, activeKey) {
    return `<a class="waLink ${activeKey === key ? "isActive" : ""}" href="${href}">${label}</a>`;
  }

  function renderNav(activeKey = "") {
    const role = getRole();
    const el = document.getElementById("wa-nav");
    if (!el) return;

    const canSeeBilling = role !== "external";

    el.innerHTML = `
      <div class="waNav">
        <div class="waNav__left">
          <div class="waBrand">WORKACCESS</div>
          ${link("Dashboard", "./dashboard.html", "dashboard", activeKey)}
          ${link("Zaměstnanci", "./employees.html", "employees", activeKey)}
          ${link("TODO", "./index.html", "todo", activeKey)}
          ${canSeeBilling ? link("Billing", "./billing.html", "billing", activeKey) : ""}
        </div>

        <div class="waNav__right">
          <span class="waRoleLabel">Role:</span>
          <span class="waRolePill" id="waRolePill">${escapeHtml(roleLabel(role))}</span>
          <button class="waBtn" id="waBtnRole" type="button">Změnit roli</button>
        </div>
      </div>
    `;

    document.getElementById("waBtnRole")?.addEventListener("click", openRoleModal);
  }

  function openRoleModal() {
    const current = getRole();

    const back = document.createElement("div");
    back.className = "waModalBack";
    back.innerHTML = `
      <div class="waModal" role="dialog" aria-modal="true">
        <div class="waModal__head">
          <strong>Vyber roli (DEMO)</strong>
          <button class="waIconBtn" id="waClose" title="Zavřít" type="button">✖</button>
        </div>
        <div class="waModal__body">
          <p>Role se ukládá do localStorage a posílá se do backendu přes hlavičku <code>x-role</code>.</p>
          <select id="waRoleSelect">
            <option value="hr">HR</option>
            <option value="security">Bezpečnost</option>
            <option value="manager">Manažer</option>
            <option value="external">Externista</option>
          </select>
        </div>
        <div class="waModal__foot">
          <button class="waBtn" id="waCancel" type="button">Zrušit</button>
          <button class="waBtn waBtn--primary" id="waApply" type="button">Použít roli</button>
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

  window.WA_NAV = { renderNav, getRole, setRole, roleLabel };
})();
