// frontend/api.js
// Jedno místo pro volání backendu + automatické posílání x-role.
// Používá WA_CONFIG.getApiBase() z frontend/js/wa_config.js
(() => {
  function apiBase() {
    if (window.WA_CONFIG && typeof window.WA_CONFIG.getApiBase === "function") {
      return window.WA_CONFIG.getApiBase(); // vrací už včetně /api
    }
    return "http://localhost:3000/api";
  }

  function currentRole() {
    // Preferujeme WA_NAV (jediný zdroj pravdy)
    if (window.WA_NAV && typeof window.WA_NAV.getRole === "function") {
      return window.WA_NAV.getRole();
    }
    // fallback (kdyby nav nebyl načten)
    return (localStorage.getItem("workaccess.portal.role") || "hr").toString();
  }

  function roleHeader() {
    return { "x-role": currentRole() };
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
    const headers = {
      ...roleHeader(),
      ...(opts.headers || {}),
    };

    const res = await fetch(apiBase() + path, { ...opts, headers });

    if (!res.ok) {
      const body = await readJsonIfAny(res);
      const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    return readJsonIfAny(res);
  }

  // --- endpoints ---
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
  const toggleItem = (id) => apiFetch(`/items/${encodeURIComponent(id)}`, { method: "PATCH" });
  const deleteItem = (id) => apiFetch(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  const deleteDone = () => apiFetch("/items", { method: "DELETE" });
  const updateItemText = (id, text) =>
    apiFetch(`/items/${encodeURIComponent(id)}/text`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

  // --- audit v2 ---
  // params: { limit, cursor, actorRole, action, entityType, entityId, from, to }
  const getAudit = (params = {}) => apiFetch(`/audit${buildQuery(params)}`);

  // vrátí URL pro export CSV (role header se nedá přidat do <a>, proto použijeme fetchDownloadCsv)
  const getAuditCsvUrl = (params = {}) => apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;

  async function fetchAuditCsv(params = {}) {
    const url = apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;
    const res = await fetch(url, { headers: { ...roleHeader() } });

    if (!res.ok) {
      // u CSV endpointu může být text, proto zkusíme JSON a pak fallback
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

    const blob = await res.blob();
    return blob;
  }

  window.WA_API = {
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
