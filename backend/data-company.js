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
    updatedAt: nowIso(),
    createdAt: nowIso(),
  };
}

function normalizeCompanyBody(body = {}, prev = {}) {
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

  // doplníme missing fields (jemná migrace)
  const def = defaultCompany(cid);
  const merged = { ...def, ...data };

  // pokud chybí timestamps, doplníme
  if (!merged.createdAt) merged.createdAt = def.createdAt;
  merged.updatedAt = merged.updatedAt || def.updatedAt;

  // ulož jen pokud se něco opravilo
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
