// frontend/api.js
// Centralizovaná gateway pro volání backendu.
//
// Produkční disciplína (BOX #51):
// - JWT je primární auth (wa_auth_token).
// - V produkci (reverse proxy /api) nepoužíváme DEMO x-role fallback.
// - Globální 401 handler: při 401 vyčisti token, ulož návratovou URL a přesměruj na login.html.
// - Billing gate (402 TrialExpired) zachován.
// - CSV export sjednocen do stejného error handleru.

(() => {
  function apiBase() {
    if (window.WA_CONFIG && typeof window.WA_CONFIG.getApiBase === "function") {
      return window.WA_CONFIG.getApiBase();
    }
    return "http://localhost:3000/api";
  }

  function isDevLocalApi() {
    // Pokud base obsahuje localhost, bereme to jako DEV režim.
    // V produkci má být "/api".
    const b = String(apiBase() || "").toLowerCase();
    return b.includes("localhost") || b.includes("127.0.0.1");
  }

  function safeString(v) {
    return (v ?? "").toString().trim();
  }

  function getToken() {
    return localStorage.getItem("wa_auth_token");
  }

  function clearToken() {
    try {
      localStorage.removeItem("wa_auth_token");
    } catch {}
  }

  function currentRole() {
    if (window.WA_NAV && typeof window.WA_NAV.getRole === "function") {
      return window.WA_NAV.getRole();
    }
    return (localStorage.getItem("wa_role_key") || "external").toString();
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
    if (companyId) base["x-company-id"] = companyId;

    // JWT má prioritu
    if (token) {
      return {
        ...base,
        Authorization: `Bearer ${token}`,
        ...extra,
      };
    }

    // DEMO fallback pouze v DEV (localhost API)
    if (isDevLocalApi()) {
      return {
        ...base,
        "x-role": currentRole(),
        ...extra,
      };
    }

    // Produkce bez tokenu: žádný fallback (backend vrátí 401 -> globální handler)
    return {
      ...base,
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

  function pageName() {
    const p = (location.pathname || "").split("/").pop() || "";
    return p.toLowerCase();
  }

  function rememberAfterLogin() {
    // Uložíme návratovou URL, aby se uživatel po přihlášení mohl vrátit.
    // Použijeme pathname + search + hash, bez originu.
    try {
      const target = `${location.pathname || ""}${location.search || ""}${location.hash || ""}`;
      sessionStorage.setItem("wa_after_login", target);
    } catch {}
  }

  function goToLogin() {
    const here = pageName();
    if (here === "login.html") return;

    rememberAfterLogin();
    try {
      location.href = "./login.html";
    } catch {
      location.replace("./login.html");
    }
  }

  // ---------- BILLING GATE (BOX #20/#21) ----------

  function isAllowlistedPage() {
    const p = pageName();
    if (p === "login.html") return true;
    if (p === "billing.html") return true;
    if (p === "dashboard.html") return true;
    if (p === "compliance.html") return true;
    if (p === "audit.html") return true;
    return false;
  }

  function rememberPaywall(reason = "TrialExpired") {
    try {
      sessionStorage.setItem("wa_paywall", "1");
      sessionStorage.setItem("wa_paywall_reason", safeString(reason) || "TrialExpired");
      sessionStorage.setItem("wa_paywall_ts", String(Date.now()));
    } catch {}
  }

  function goToBillingHub() {
    const here = pageName();
    if (here === "billing.html") return;

    try {
      location.href = "./billing.html";
    } catch {
      location.replace("./billing.html");
    }
  }

  function isTrialExpiredError(e) {
    return (
      !!e &&
      (e.status === 402 ||
        e.code === "TrialExpired" ||
        String(e.message || "").includes("TrialExpired"))
    );
  }

  function getGateCache() {
    try {
      const raw = sessionStorage.getItem("wa_gate_cache");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setGateCache(obj) {
    try {
      sessionStorage.setItem("wa_gate_cache", JSON.stringify(obj || {}));
    } catch {}
  }

  async function ensureBillingGate() {
    if (isAllowlistedPage()) return { ok: true, skipped: true };

    const cid = safeString(getCompanyId());
    if (!cid) return { ok: true, skipped: true };

    // cache 60s
    const cache = getGateCache();
    if (cache && typeof cache.ts === "number" && Date.now() - cache.ts < 60_000) {
      if (cache.locked) {
        rememberPaywall(cache.reason || "TrialExpired");
        goToBillingHub();
        return { ok: false, locked: true, cached: true };
      }
      return { ok: true, cached: true };
    }

    try {
      const res = await fetch(apiBase() + "/billing/status", {
        method: "GET",
        headers: buildHeaders(),
      });

      // 401: uživatel není přihlášen / token invalid -> globální redirect na login
      if (res.status === 401) {
        clearToken();
        setGateCache({ ts: Date.now(), locked: false, reason: null });
        goToLogin();
        return { ok: false, unauthorized: true };
      }

      if (res.status === 402) {
        setGateCache({ ts: Date.now(), locked: true, reason: "TrialExpired" });
        rememberPaywall("TrialExpired");
        goToBillingHub();
        return { ok: false, locked: true };
      }

      if (!res.ok) {
        setGateCache({ ts: Date.now(), locked: false, reason: null });
        return { ok: true, softFail: true, status: res.status };
      }

      const data = await readJsonIfAny(res);

      const subActive = !!data?.subscription?.active;
      const trialExpired = !!data?.trial?.expired;

      const locked = trialExpired && !subActive;

      setGateCache({
        ts: Date.now(),
        locked,
        reason: locked ? "TrialExpired" : null,
      });

      if (locked) {
        rememberPaywall("TrialExpired");
        goToBillingHub();
        return { ok: false, locked: true };
      }

      return { ok: true, locked: false };
    } catch {
      return { ok: true, softFail: true };
    }
  }

  // Gate spustíme hned (asynchronně)
  ensureBillingGate();

  // ---------- CORE ERROR HANDLING ----------

  function buildHttpError(res, body) {
    const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = body?.error || null;
    err.body = body || null;
    return err;
  }

  function handleAuthAndGateSideEffects(err) {
    // 401: JWT missing/invalid -> vyčisti token + redirect na login
    if (Number(err?.status || 0) === 401) {
      clearToken();
      setGateCache({ ts: Date.now(), locked: false, reason: null });
      goToLogin();
      return;
    }

    // 402: billing gate
    if (isTrialExpiredError(err)) {
      setGateCache({ ts: Date.now(), locked: true, reason: "TrialExpired" });
      rememberPaywall("TrialExpired");
      if (!isAllowlistedPage()) goToBillingHub();
      return;
    }
  }

  // ---------- CORE FETCH ----------

  async function apiFetch(path, opts = {}) {
    const headers = buildHeaders(opts.headers || {});
    const res = await fetch(apiBase() + path, { ...opts, headers });

    if (!res.ok) {
      const body = await readJsonIfAny(res);
      const err = buildHttpError(res, body);
      handleAuthAndGateSideEffects(err);
      throw err;
    }

    return readJsonIfAny(res);
  }

  // --- AUTH ---
  const login = async (email, password) => {
    const r = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const cid = safeString(r?.user?.companyId);
    if (cid) localStorage.setItem("wa_company_id", cid);

    const tok = safeString(r?.token);
    if (tok) localStorage.setItem("wa_auth_token", tok);

    setGateCache({ ts: Date.now(), locked: false, reason: null });

    return r;
  };

  const getAuthMe = () => apiFetch("/auth/me");

  const logout = () => {
    clearToken();
    setGateCache({ ts: Date.now(), locked: false, reason: null });
  };

  // --- BILLING ---
  const getBillingStatus = () => apiFetch("/billing/status");

  const billingActivate = (plan = "basic", days = 30) =>
    apiFetch("/billing/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, days }),
    });

  const billingCancel = () => apiFetch("/billing/cancel", { method: "POST" });

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

  const toggleItem = (id) => apiFetch(`/items/${encodeURIComponent(id)}`, { method: "PATCH" });

  const deleteItem = (id) => apiFetch(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });

  const deleteDone = () => apiFetch("/items", { method: "DELETE" });

  const updateItemText = (id, text) =>
    apiFetch(`/items/${encodeURIComponent(id)}/text`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

  // --- AUDIT ---
  const getAudit = (params = {}) => apiFetch(`/audit${buildQuery(params)}`);

  const getAuditCsvUrl = (params = {}) => apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;

  async function fetchAuditCsv(params = {}) {
    const url = apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;
    const res = await fetch(url, { headers: buildHeaders() });

    if (!res.ok) {
      // pokus o JSON error (pokud server vrátí)
      let body = null;
      try {
        body = await readJsonIfAny(res);
      } catch {
        body = null;
      }

      const err = buildHttpError(res, body);
      handleAuthAndGateSideEffects(err);
      throw err;
    }

    return await res.blob();
  }

  // --- COMPLIANCE ---
  const getComplianceOverview = () => apiFetch("/company-compliance/overview");
  const getCompanyComplianceDocuments = () => apiFetch("/company-compliance-documents");
  const getCompanyDocumentTemplates = () => apiFetch("/company-document-templates");

  const createComplianceFromTemplate = (templateId, extra = {}) =>
    apiFetch("/company-compliance-documents/from-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, ...extra }),
    });

  window.WA_API = {
    // auth
    login,
    getAuthMe,
    logout,

    // billing
    getBillingStatus,
    billingActivate,
    billingCancel,

    // gate
    ensureBillingGate,

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

    // compliance
    getComplianceOverview,
    getCompanyComplianceDocuments,
    getCompanyDocumentTemplates,
    createComplianceFromTemplate,
  };
})();