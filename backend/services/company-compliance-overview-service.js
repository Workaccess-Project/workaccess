// backend/services/company-compliance-overview-service.js
import { readTenantEntity } from "../data/tenant-store.js";

const TEMPLATES_ENTITY = "companyDocumentTemplates";
const DOCS_ENTITY = "companyComplianceDocuments";

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function safeString(v) {
  return (v ?? "").toString().trim();
}

function requireCompanyId(companyId) {
  const c = safeString(companyId);
  if (!c) {
    const err = new Error("Missing companyId (tenant context).");
    err.status = 400;
    throw err;
  }
  return c;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function parseDateOrNull(iso) {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isExpiredDoc(doc, now) {
  if (String(doc?.status || "") === "expired") return true;
  const exp = parseDateOrNull(doc?.expiresAt);
  if (!exp) return false;
  return exp.getTime() < now.getTime();
}

function isExpiringSoonDoc(doc, now, soon) {
  const exp = parseDateOrNull(doc?.expiresAt);
  if (!exp) return false;
  const t = exp.getTime();
  return t >= now.getTime() && t <= soon.getTime();
}

export async function getCompanyComplianceOverview({ companyId }) {
  const cid = requireCompanyId(companyId);

  const templates = asArray(await readTenantEntity(cid, TEMPLATES_ENTITY));
  const docs = asArray(await readTenantEntity(cid, DOCS_ENTITY));

  const now = new Date();
  const soon = addDays(now, 30);

  let expired = 0;
  let expiringSoon = 0;
  let active = 0;

  for (const d of docs) {
    const expiredNow = isExpiredDoc(d, now);
    if (expiredNow) {
      expired += 1;
      continue;
    }
    active += 1;
    if (isExpiringSoonDoc(d, now, soon)) {
      expiringSoon += 1;
    }
  }

  const templateIdsWithDocs = new Set(
    docs.map((d) => safeString(d?.templateId)).filter((x) => !!x)
  );

  let missing = 0;
  for (const t of templates) {
    const tid = safeString(t?.id);
    if (!tid) continue;
    if (!templateIdsWithDocs.has(tid)) missing += 1;
  }

  return {
    totalTemplates: templates.length,
    totalDocuments: docs.length,
    active,
    expired,
    expiringSoon,
    missing,
  };
}
