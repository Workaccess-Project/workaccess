// backend/data.js
// Tenant-scoped storage for TODO items via tenant-store (hard isolation)

import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";

const ENTITY = "items";

function requireCompanyId(companyId) {
  const cid = (companyId ?? "").toString().trim();
  if (!cid) {
    const err = new Error("Missing companyId");
    err.status = 400;
    throw err;
  }
  return cid;
}

export async function readData(companyId) {
  const cid = requireCompanyId(companyId);
  const data = await readTenantEntity(cid, ENTITY);
  return Array.isArray(data) ? data : [];
}

export async function writeData(companyId, items) {
  const cid = requireCompanyId(companyId);
  const arr = Array.isArray(items) ? items : [];
  await writeTenantEntity(cid, ENTITY, arr);
}
