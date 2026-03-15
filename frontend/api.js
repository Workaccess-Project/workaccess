// frontend/api.js
// Centralized gateway for backend calls.
//
// Production rules:
// - JWT is the primary auth (wa_auth_token).
// - In production (/api reverse proxy) do not use DEMO x-role fallback.
// - Global 401 handler clears token, stores return URL, redirects to /login.
// - Billing gate (402 TrialExpired) stays enabled.
// - CSV export uses the same error handler.
//
// BOX #68:
// - Frontend handling 403 ROLE_LOCK + FEATURE_LOCK (store reason + safe redirect)
//
// BOX #84:
// - Stripe Customer Portal helper: POST /billing/stripe/customer-portal
//
// BOX #88.1:
// - Stripe Checkout helper: POST /billing/stripe/create-checkout-session
//
// BOX #92:
// - Billing limits helper: GET /billing/limits
//
// BOX #101:
// - Public company registration helper: POST /public/register-company
//
// BOX #103:
// - Company profile helpers: GET /company, PUT /company
//
// BOX #111:
// - System diagnostics helper: GET /system/info
//
// BOX #119:
// - Tenant backup download helper: GET /system/tenant-backup with auth headers
//
// BOX #122:
// - Tenant restore helper: POST /system/tenant-restore
//
// BOX #131:
// - Restore history helper: GET /system/restore-history
//
// BOX #133:
// - Storage diagnostics helper: GET /system/storage-diagnostics

(() => {
  function apiBase() {
    if (window.WA_CONFIG && typeof window.WA_CONFIG.getApiBase === "function") {
      return window.WA_CONFIG.getApiBase();
    }
    return "/api";
  }

  function isDevLocalApi() {
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

      const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
      const json = atob(b64 + pad);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function getCompanyId() {
    if (window.WA_NAV && typeof window.WA_NAV.getCompanyId === "function") {
      const cid = safeString(window.WA_NAV.getCompanyId());
      if (cid) return cid;
    }

    const fromLs = safeString(localStorage.getItem("wa_company_id"));
    if (fromLs) return fromLs;

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

    if (token) {
      return {
        ...base,
        Authorization: `Bearer ${token}`,
        ...extra,
      };
    }

    // DEV fallback only when using localhost API
    if (isDevLocalApi()) {
      return {
        ...base,
        "x-role": currentRole(),
        ...extra,
      };
    }

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
    const p = (location.pathname || "").split("/").filter(Boolean).pop() || "";
    return p.toLowerCase();
  }

  function isLoginRoute() {
    const p = pageName();
    return p === "login" || p === "login.html";
  }

  function isBillingRoute() {
    const p = pageName();
    return p === "billing" || p === "billing.html";
  }

  function rememberAfterLogin() {
    try {
      const target = `${location.pathname || ""}${location.search || ""}${location.hash || ""}`;
      sessionStorage.setItem("wa_after_login", target);
    } catch {}
  }

  function goToLogin() {
    if (isLoginRoute()) return;

    rememberAfterLogin();
    try {
      location.href = "/login";
    } catch {
      location.replace("/login");
    }
  }

  // ---------- BILLING GATE ----------

  function isAllowlistedPage() {
    const p = pageName();
    if (p === "login" || p === "login.html") return true;
    if (p === "billing" || p === "billing.html") return true;
    if (p === "dashboard" || p === "dashboard.html") return true;
    if (p === "compliance" || p === "compliance.html") return true;
    if (p === "audit" || p === "audit.html") return true;
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
    if (isBillingRoute()) return;

    try {
      location.href = "/billing";
    } catch {
      location.replace("/billing");
    }
  }

  function isTrialExpiredError(e) {
    return (
      !!e &&
      (e.status === 402 || e.code === "TrialExpired" || String(e.message || "").includes("TrialExpired"))
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

    const cache = getGateCache();
    if (cache && typeof cache.ts === "number" && Date.now() - cache.ts < 60000) {
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

  ensureBillingGate();

  // ---------- CORE ERROR HANDLING ----------

  function buildHttpError(res, body) {
    const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = body?.code || body?.error || null;
    err.body = body || null;
    return err;
  }

  function handleAuthAndGateSideEffects(err) {
    if (Number(err?.status || 0) === 401) {
      clearToken();
      setGateCache({ ts: Date.now(), locked: false, reason: null });
      goToLogin();
      return;
    }

    if (isTrialExpiredError(err)) {
      setGateCache({ ts: Date.now(), locked: true, reason: "TrialExpired" });
      rememberPaywall("TrialExpired");
      if (!isAllowlistedPage()) goToBillingHub();
      return;
    }

    if (Number(err?.status || 0) === 402) {
      setGateCache({
        ts: Date.now(),
        locked: true,
        reason: safeString(err?.body?.error) || "BillingRequired",
      });
      rememberPaywall(safeString(err?.body?.code) || "BillingRequired");
      if (!isAllowlistedPage()) goToBillingHub();
      return;
    }

    if (Number(err?.status || 0) === 403) {
      const code = safeString(err?.body?.code || err?.code || "");

      if (code === "ROLE_LOCK" || code === "FEATURE_LOCK") {
        try {
          sessionStorage.setItem("wa_forbidden", "1");
          sessionStorage.setItem("wa_forbidden_code", code);
          sessionStorage.setItem("wa_forbidden_ts", String(Date.now()));

          const details = err?.body?.details ? JSON.stringify(err.body.details).slice(0, 2000) : "";
          sessionStorage.setItem("wa_forbidden_details", details);
        } catch {}

        const p = pageName();
        if (p !== "dashboard" && p !== "dashboard.html") {
          try {
            location.href = "/dashboard";
          } catch {
            location.replace("/dashboard");
          }
        }
        return;
      }
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

  const registerCompany = async (payload = {}) => {
    const r = await apiFetch("/public/register-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

    const cid = safeString(r?.user?.companyId || r?.companyId);
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
  const getBillingLimits = () => apiFetch("/billing/limits");

  const billingActivate = (plan = "basic", days = 30) =>
    apiFetch("/billing/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, days }),
    });

  const billingCancel = () => apiFetch("/billing/cancel", { method: "POST" });

  const billingCustomerPortal = () =>
    apiFetch("/billing/stripe/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

  const billingCreateCheckoutSession = (plan = "basic") =>
    apiFetch("/billing/stripe/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });

  // --- CORE DATA ---
  const getMe = () => apiFetch("/me");

  // --- COMPANY ---
  const getCompany = () => apiFetch("/company");

  const updateCompany = (payload = {}) =>
    apiFetch("/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

  // --- EMPLOYEES ---
  const getEmployees = () => apiFetch("/employees");
  const getEmployee = (id) => apiFetch(`/employees/${encodeURIComponent(id)}`);

  const createEmployee = (payload = {}) =>
    apiFetch("/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

  // --- ITEMS ---
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

  const getAuditCsvUrl = (params = {}) =>
    apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;

  async function fetchAuditCsv(params = {}) {
    const url = apiBase() + `/audit${buildQuery({ ...params, format: "csv" })}`;
    const res = await fetch(url, { headers: buildHeaders() });

    if (!res.ok) {
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

  // --- SYSTEM ---
  const getSystemInfo = () => apiFetch("/system/info");
  const getStorageDiagnostics = () => apiFetch("/system/storage-diagnostics");
  const getRestoreHistory = (limit = 20) => apiFetch(`/system/restore-history${buildQuery({ limit })}`);

  async function fetchTenantBackupBlob() {
    const res = await fetch(apiBase() + "/system/tenant-backup", {
      method: "GET",
      headers: buildHeaders(),
    });

    if (!res.ok) {
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

    const blob = await res.blob();
    const header = safeString(res.headers.get("content-disposition"));
    const match = header.match(/filename="?([^"]+)"?/i);
    const fileName = safeString(match?.[1]) || `${safeString(getCompanyId()) || "tenant"}-backup.json`;

    return { blob, fileName };
  }

  async function restoreTenantBackup(files = [], confirmation = "") {
    return apiFetch("/system/tenant-restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmation: safeString(confirmation),
        files: Array.isArray(files) ? files : [],
      }),
    });
  }

  window.WA_API = {
    // auth
    login,
    registerCompany,
    getAuthMe,
    logout,

    // billing
    getBillingStatus,
    getBillingLimits,
    billingActivate,
    billingCancel,
    billingCustomerPortal,
    billingCreateCheckoutSession,

    // gate
    ensureBillingGate,

    // data
    getMe,
    getCompany,
    updateCompany,

    // employees
    getEmployees,
    getEmployee,
    createEmployee,

    // items
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

    // system
    getSystemInfo,
    getStorageDiagnostics,
    getRestoreHistory,
    fetchTenantBackupBlob,
    restoreTenantBackup,
  };
})();
