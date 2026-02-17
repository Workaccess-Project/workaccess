// backend/data-company.js
import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";

const ENTITY = "company";

function nowIso() {
  return new Date().toISOString();
}

function safeString(v) {
  return (v ?? "").toString().trim();
}

function requireCompanyId(companyId) {
  const cid = safeString(companyId);
  if (!cid) {
    const err = new Error("Missing companyId");
    err.status = 400;
    throw err;
  }
  return cid;
}

function defaultAlerts() {
  return {
    expirationsDays: 30,

    // legacy fallback (kompatibilita)
    digestEmail: "",

    // nový preferovaný recipient přes Contacts
    digestRecipientContactId: "",

    lastDigestSentOn: "", // YYYY-MM-DD
  };
}

function defaultCompany(companyId) {
  return {
    companyId: safeString(companyId),
    name: "",
    ico: "",
    dic: "",
    address: "",
    city: "",
    zip: "",
    country: "CZ",
    email: "",
    phone: "",
    alerts: defaultAlerts(),
    updatedAt: nowIso(),
    createdAt: nowIso(),
  };
}

function normalizeAlertsBody(body = {}, prev = defaultAlerts()) {
  const daysRaw = body?.expirationsDays ?? prev.expirationsDays ?? 30;
  const daysNum = Number(daysRaw);
  const expirationsDays = Number.isFinite(daysNum)
    ? Math.max(1, Math.min(365, Math.floor(daysNum)))
    : 30;

  // lastDigestSentOn: ukládáme jako string (očekáváme YYYY-MM-DD)
  const lastDigestSentOn = safeString(body?.lastDigestSentOn ?? prev.lastDigestSentOn);

  return {
    expirationsDays,

    // legacy
    digestEmail: safeString(body?.digestEmail ?? prev.digestEmail),

    // new
    digestRecipientContactId: safeString(
      body?.digestRecipientContactId ?? prev.digestRecipientContactId
    ),

    lastDigestSentOn,
  };
}

function normalizeCompanyBody(body = {}, prev = {}) {
  const prevAlerts =
    prev?.alerts && typeof prev.alerts === "object" ? prev.alerts : defaultAlerts();

  return {
    ...prev,
    name: safeString(body.name ?? prev.name),
    ico: safeString(body.ico ?? prev.ico),
    dic: safeString(body.dic ?? prev.dic),
    address: safeString(body.address ?? prev.address),
    city: safeString(body.city ?? prev.city),
    zip: safeString(body.zip ?? prev.zip),
    country: safeString(body.country ?? prev.country) || "CZ",
    email: safeString(body.email ?? prev.email),
    phone: safeString(body.phone ?? prev.phone),

    // alerts může přijít buď jako body.alerts, nebo přímo v body (kvůli kompatibilitě)
    alerts: normalizeAlertsBody(body.alerts ?? body, prevAlerts),
  };
}

export async function getCompanyProfile(companyId) {
  const cid = requireCompanyId(companyId);
  const data = await readTenantEntity(cid, ENTITY);

  // tenant-store zakládá [] -> my chceme objekt
  if (Array.isArray(data)) {
    const def = defaultCompany(cid);
    await writeTenantEntity(cid, ENTITY, def);
    return def;
  }

  if (!data || typeof data !== "object") {
    const def = defaultCompany(cid);
    await writeTenantEntity(cid, ENTITY, def);
    return def;
  }

  // jemná migrace: doplníme missing fields včetně alerts
  const def = defaultCompany(cid);
  const merged = { ...def, ...data };

  // alerts merge zvlášť (aby se doplnily nové fields)
  const aDef = defaultAlerts();
  const aData = merged?.alerts && typeof merged.alerts === "object" ? merged.alerts : {};
  merged.alerts = { ...aDef, ...aData };

  if (!merged.createdAt) merged.createdAt = def.createdAt;
  merged.updatedAt = merged.updatedAt || def.updatedAt;

  const changed = JSON.stringify(merged) !== JSON.stringify(data);
  if (changed) await writeTenantEntity(cid, ENTITY, merged);

  return merged;
}

export async function updateCompanyProfile(companyId, body) {
  const cid = requireCompanyId(companyId);
  const prev = await getCompanyProfile(cid);

  const next = {
    ...normalizeCompanyBody(body, prev),
    companyId: cid,
    createdAt: prev.createdAt || prev.createdAt,
    updatedAt: nowIso(),
  };

  await writeTenantEntity(cid, ENTITY, next);
  return { before: prev, after: next };
}
