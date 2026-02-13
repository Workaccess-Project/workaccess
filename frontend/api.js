// frontend/api.js
// Jedno místo pro volání backendu.
// - Pokud existuje JWT token → posílá Authorization: Bearer ...
// - Jinak fallback na DEMO x-role

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

  function buildHeaders(extra = {}) {
    const token = getToken();

    // JWT má prioritu
    if (token) {
      return {
        Authorization: `Bearer ${token}`,
        ...extra,
      };
    }

    // fallback DEMO režim
    return {
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
      const msg =
        body?.error || body?.message || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    return readJsonIfAny(res);
  }

  // --- AUTH ---
  const login = async (email, password) =>
    apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

  const getAuthMe = () => apiFetch("/auth/me");

  const logout = () => {
    localStorage.removeItem("wa_auth_token");
  };

  // --- EXISTING ENDPOINTS ---
  const getMe = () => apiFetch("/me");

  const getEmployees = () => apiFetch("/employees");
  const getEmployee = (id) =>
    apiFetch(`/employees/${encodeURIComponent(id)}`);

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

  const getAudit = (params = {}) =>
    apiFetch(`/audit${buildQuery(params)}`);

  const getAuditCsvUrl = (params = {}) =>
    apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;

  async function fetchAuditCsv(params = {}) {
    const url =
      apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;

    const res = await fetch(url, {
      headers: buildHeaders(),
    });

    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/json")) {
          const j = await res.json();
          msg = j?.error || j?.message || msg;
        }
      } catch {}
      throw new Error(msg);
    }

    return await res.blob();
  }

  window.WA_API = {
    login,
    getAuthMe,
    logout,
    getMe,
    getEmployees,
    getEmployee,
    getItems,
    addItem,
    toggleItem,
    deleteItem,
    deleteDone,
    updateItemText,
    getAudit,
    getAuditCsvUrl,
    fetchAuditCsv,
  };
})();
