// frontend/api.js
// Jedno místo pro volání backendu.
// - Pokud existuje JWT token → posílá Authorization: Bearer ...
// - Jinak fallback na DEMO x-role
//
// DŮLEŽITÉ:
// - Backend je multitenant → posíláme x-company-id (z WA_NAV / localStorage / JWT)

(() => {
  function apiBase() {
    if (window.WA_CONFIG && typeof window.WA_CONFIG.getApiBase === "function") {
      return window.WA_CONFIG.getApiBase();
    }
    return "http://localhost:3000/api";
  }

  function getToken() {
    return localStorage.getItem("wa_auth_token");
  }

  function currentRole() {
    if (window.WA_NAV && typeof window.WA_NAV.getRole === "function") {
      return window.WA_NAV.getRole();
    }
    return (localStorage.getItem("wa_role_key") || "external").toString();
  }

  function safeString(v) {
    return (v ?? "").toString().trim();
  }

  function parseJwtPayload(token) {
    try {
      const t = safeString(token);
      if (!t || !t.includes(".")) return null;
      const payload = t.split(".")[1];
      if (!payload) return null;

      // base64url -> base64
      const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
      const json = atob(b64 + pad);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function getCompanyId() {
    // 1) WA_NAV (pokud existuje)
    if (window.WA_NAV && typeof window.WA_NAV.getCompanyId === "function") {
      const cid = safeString(window.WA_NAV.getCompanyId());
      if (cid) return cid;
    }

    // 2) localStorage
    const fromLs = safeString(localStorage.getItem("wa_company_id"));
    if (fromLs) return fromLs;

    // 3) JWT payload
    const token = getToken();
    if (token) {
      const p = parseJwtPayload(token);
      const cid = safeString(p?.companyId);
      if (cid) return cid;
    }

    return "";
  }

  function buildHeaders(extra = {}) {
    const token = getToken();
    const companyId = getCompanyId();

    const base = {};

    if (companyId) {
      base["x-company-id"] = companyId;
    }

    // JWT má prioritu
    if (token) {
      return {
        ...base,
        Authorization: `Bearer ${token}`,
        ...extra,
      };
    }

    // fallback DEMO režim
    return {
      ...base,
      "x-role": currentRole(),
      ...extra,
    };
  }

  async function readJsonIfAny(res) {
    if (res.status === 204) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  function buildQuery(params = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null) continue;
      const s = String(v).trim();
      if (!s) continue;
      q.set(k, s);
    }
    const qs = q.toString();
    return qs ? `?${qs}` : "";
  }

  async function apiFetch(path, opts = {}) {
    const headers = buildHeaders(opts.headers || {});
    const res = await fetch(apiBase() + path, { ...opts, headers });

    if (!res.ok) {
      const body = await readJsonIfAny(res);
      const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;

      const err = new Error(msg);
      err.status = res.status;
      err.code = body?.error || null;
      err.body = body || null;
      throw err;
    }

    return readJsonIfAny(res);
  }

  // --- AUTH ---
  const login = async (email, password) => {
    // Pozn.: login je tenant-scoped → musí být nastaven x-company-id (z WA_NAV / localStorage)
    const r = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    // pokud backend vrátí user.companyId, uložíme pro další requesty
    const cid = safeString(r?.user?.companyId);
    if (cid) localStorage.setItem("wa_company_id", cid);

    // token si typicky ukládá login stránka / wa_nav, ale pro jistotu:
    const tok = safeString(r?.token);
    if (tok) localStorage.setItem("wa_auth_token", tok);

    return r;
  };

  const getAuthMe = () => apiFetch("/auth/me");

  const logout = () => {
    localStorage.removeItem("wa_auth_token");
    // companyId necháváme (může urychlit další login), ale pokud chceš:
    // localStorage.removeItem("wa_company_id");
  };

  // --- BILLING ---
  const getBillingStatus = () => apiFetch("/billing/status");

  const billingActivate = (plan = "basic", days = 30) =>
    apiFetch("/billing/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, days }),
    });

  const billingCancel = () =>
    apiFetch("/billing/cancel", {
      method: "POST",
    });

  // --- EXISTING ENDPOINTS ---
  const getMe = () => apiFetch("/me");

  const getEmployees = () => apiFetch("/employees");
  const getEmployee = (id) => apiFetch(`/employees/${encodeURIComponent(id)}`);

  const getItems = () => apiFetch("/items");
  const addItem = (text) =>
    apiFetch("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

  const toggleItem = (id) =>
    apiFetch(`/items/${encodeURIComponent(id)}`, { method: "PATCH" });

  const deleteItem = (id) =>
    apiFetch(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });

  const deleteDone = () => apiFetch("/items", { method: "DELETE" });

  const updateItemText = (id, text) =>
    apiFetch(`/items/${encodeURIComponent(id)}/text`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

  const getAudit = (params = {}) => apiFetch(`/audit${buildQuery(params)}`);

  const getAuditCsvUrl = (params = {}) =>
    apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;

  async function fetchAuditCsv(params = {}) {
    const url = apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;

    const res = await fetch(url, { headers: buildHeaders() });

    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/json")) {
          const j = await res.json();
          msg = j?.error || j?.message || msg;
        }
      } catch {}

      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return await res.blob();
  }

  window.WA_API = {
    // auth
    login,
    getAuthMe,
    logout,

    // billing
    getBillingStatus,
    billingActivate,
    billingCancel,

    // data
    getMe,
    getEmployees,
    getEmployee,
    getItems,
    addItem,
    toggleItem,
    deleteItem,
    deleteDone,
    updateItemText,

    // audit
    getAudit,
    getAuditCsvUrl,
    fetchAuditCsv,
  };
})();
