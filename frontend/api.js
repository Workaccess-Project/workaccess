// frontend/api.js
// Jedno místo pro volání backendu + automatické posílání x-role.
// Používá WA_CONFIG.getApiBase() z frontend/js/wa_config.js
(() => {
  function apiBase() {
    // fallback kdyby WA_CONFIG nebyl načtený (ať to nespadne)
    if (window.WA_CONFIG && typeof window.WA_CONFIG.getApiBase === "function") {
      return window.WA_CONFIG.getApiBase(); // vrací už včetně /api
    }
    return "http://localhost:3000/api";
  }

  function roleHeader() {
    // MUSÍ sedět s wa_nav.js (tam je workaccess.role)
    const role = localStorage.getItem("workaccess.role") || "hr";
    return { "x-role": role };
  }

  async function readJsonIfAny(res) {
    if (res.status === 204) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return null;
    try { return await res.json(); } catch { return null; }
  }

  async function apiFetch(path, opts = {}) {
    // path očekáváme jako "/me", "/items", ...
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
  const addItem = (text) => apiFetch("/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const toggleItem = (id) => apiFetch(`/items/${encodeURIComponent(id)}`, { method: "PATCH" });
  const deleteItem = (id) => apiFetch(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  const deleteDone = () => apiFetch("/items", { method: "DELETE" });
  const updateItemText = (id, text) => apiFetch(`/items/${encodeURIComponent(id)}/text`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

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
  };
})();
