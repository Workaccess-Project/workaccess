// frontend/api.js
// Jedno místo pro volání backendu.
// - Pokud existuje JWT token → posílá Authorization: Bearer ...
// - Jinak fallback na DEMO x-role
//
// DŮLEŽITÉ:
// - Backend je multitenant → posíláme x-company-id (z WA_NAV / localStorage / JWT)
//
// BOX #20:
// - Globální billing gate ve frontendu:
//   - Pokud backend vrátí 402 TrialExpired a subscription není aktivní → redirect na dashboard.html
//   - Tichá kontrola /billing/status při loadu (pokud jsme na chráněné stránce)

(() => {
  function apiBase() {
    if (window.WA_CONFIG && typeof window.WA_CONFIG.getApiBase === "function") {
      return window.WA_CONFIG.getApiBase();
    }
    return "http://localhost:3000/api";
  }

  function safeString(v) {
    return (v ?? "").toString().trim();
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

  // ---------- BILLING GATE (BOX #20) ----------

  function pageName() {
    const p = (location.pathname || "").split("/").pop() || "";
    return p.toLowerCase();
  }

  function isAllowlistedPage() {
    const p = pageName();
    // login musí být přístupný vždy
    if (p === "login.html") return true;
    // dashboard je “billing hub” (banner + aktivace tarifu)
    if (p === "dashboard.html") return true;
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
    // “billing hub” je dashboard (protože samostatná billing.html zatím neexistuje)
    const here = pageName();
    if (here === "dashboard.html") return;
    // aby nevznikal loop – pokud z nějakého důvodu dashboard neexistuje, nebudeme donekonečna přepisovat URL
    try {
      location.href = "./dashboard.html";
    } catch {
      // fallback
      location.replace("./dashboard.html");
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

  // Cache billing status v sessionStorage (aby se to nevolalo na každé stránce 10×)
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
    // allowlist stránky neblokujeme
    if (isAllowlistedPage()) return { ok: true, skipped: true };

    // pokud ještě nemáme companyId, billing nedává smysl (např. před výběrem firmy / před loginem)
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

    // zavoláme billing status (přímo fetch, aby to nepadalo do apiFetch error flow)
    try {
      const res = await fetch(apiBase() + "/billing/status", {
        method: "GET",
        headers: buildHeaders(),
      });

      // Pokud nám billing status vrátí TrialExpired (402), je to zamčené
      if (res.status === 402) {
        setGateCache({ ts: Date.now(), locked: true, reason: "TrialExpired" });
        rememberPaywall("TrialExpired");
        goToBillingHub();
        return { ok: false, locked: true };
      }

      // jiné chyby – neblokujeme (např. 401 když nejsme přihlášeni, nebo backend down)
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
      // backend nedostupný → neblokujeme, ať se aspoň ukáže stránka a uživatel vidí chybu při requestu
      return { ok: true, softFail: true };
    }
  }

  // Gate spustíme hned při načtení api.js (asynchronně, bez blokování)
  // Pokud je zamčeno, dojde k redirectu.
  ensureBillingGate();

  // ---------- CORE FETCH ----------

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

      // Globální reakce: TrialExpired → redirect na dashboard
      if (isTrialExpiredError(err)) {
        // nastavíme cache jako locked (ať se to nechová chaoticky)
        setGateCache({ ts: Date.now(), locked: true, reason: "TrialExpired" });
        rememberPaywall("TrialExpired");
        if (!isAllowlistedPage()) goToBillingHub();
      }

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

    // po loginu pro jistotu smažeme gate cache (mohl se změnit tenant)
    setGateCache({ ts: Date.now(), locked: false, reason: null });

    return r;
  };

  const getAuthMe = () => apiFetch("/auth/me");

  const logout = () => {
    localStorage.removeItem("wa_auth_token");
    // companyId necháváme (může urychlit další login), ale pokud chceš:
    // localStorage.removeItem("wa_company_id");
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

      // Globální reakce: TrialExpired → redirect na dashboard
      if (isTrialExpiredError(err)) {
        setGateCache({ ts: Date.now(), locked: true, reason: "TrialExpired" });
        rememberPaywall("TrialExpired");
        if (!isAllowlistedPage()) goToBillingHub();
      }

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

    // gate (pro případné ruční použití na stránkách)
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
  };
})();
