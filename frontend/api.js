// frontend/js/api.js
// Jedno místo pro volání backendu + automatické posílání x-role.
(() => {
  const ORIGIN = "http://localhost:3000";

  function roleHeader() {
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
    const headers = {
      ...roleHeader(),
      ...(opts.headers || {}),
    };
    const res = await fetch(ORIGIN + path, { ...opts, headers });
    if (!res.ok) {
      const body = await readJsonIfAny(res);
      const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return readJsonIfAny(res);
  }

  // --- endpoints ---
  const getMe = () => apiFetch("/api/me");

  const getEmployees = () => apiFetch("/api/employees");
  const getEmployee = (id) => apiFetch(`/api/employees/${encodeURIComponent(id)}`);

  const getItems = () => apiFetch("/api/items");
  const addItem = (text) => apiFetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const toggleItem = (id) => apiFetch(`/api/items/${encodeURIComponent(id)}`, { method: "PATCH" });
  const deleteItem = (id) => apiFetch(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  const deleteDone = () => apiFetch("/api/items", { method: "DELETE" });
  const updateItemText = (id, text) => apiFetch(`/api/items/${encodeURIComponent(id)}/text`, {
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
