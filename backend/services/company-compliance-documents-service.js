// backend/services/company-compliance-documents-service.js
import { readTenantEntity, writeTenantEntity } from "../data/tenant-store.js";
import { auditLog } from "../data-audit.js";

const ENTITY = "companyComplianceDocuments";
const TEMPLATES_ENTITY = "companyDocumentTemplates";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "ccd") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

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

function parseIssuedAt(input) {
  // přijímáme ISO string; pokud není, použijeme teď
  if (input === undefined || input === null || input === "") {
    return new Date();
  }
  const d = new Date(String(input));
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid issuedAt (must be ISO date or date-time).");
    err.status = 400;
    err.payload = { field: "issuedAt" };
    throw err;
  }
  return d;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function readComplianceDocs(companyId) {
  const cid = requireCompanyId(companyId);
  const arr = await readTenantEntity(cid, ENTITY);
  return asArray(arr);
}

async function writeComplianceDocs(companyId, docs) {
  const cid = requireCompanyId(companyId);
  await writeTenantEntity(cid, ENTITY, docs);
}

async function readTemplates(companyId) {
  const cid = requireCompanyId(companyId);
  const arr = await readTenantEntity(cid, TEMPLATES_ENTITY);
  return asArray(arr);
}

function findById(arr, id) {
  return arr.find((x) => String(x.id) === String(id)) || null;
}

// --- API ---

export async function listCompanyComplianceDocuments({ companyId }) {
  const arr = await readComplianceDocs(companyId);
  // řadíme podle createdAt desc (nejnovější nahoře)
  return arr
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

/**
 * Vytvoří compliance záznam z template.
 * Body:
 *  - templateId (required)
 *  - name (optional override)
 *  - note (optional)
 *  - issuedAt (optional ISO string; default: now)
 */
export async function createCompanyComplianceDocumentFromTemplate({
  companyId,
  actorRole,
  body,
}) {
  const templateId = safeString(body?.templateId);
  const nameOverride = safeString(body?.name);
  const note = safeString(body?.note);
  const issuedAtDate = parseIssuedAt(body?.issuedAt);

  if (!templateId) {
    const err = new Error("Missing templateId");
    err.status = 400;
    err.payload = { required: ["templateId"] };
    throw err;
  }

  const templates = await readTemplates(companyId);
  const tpl = findById(templates, templateId);

  if (!tpl) {
    const err = new Error("Template not found");
    err.status = 404;
    err.payload = { templateId };
    throw err;
  }

  const hasExpiration = !!tpl.hasExpiration;
  const expirationDays = hasExpiration ? Number(tpl.expirationDays || 0) : 0;

  let expiresAt = null;
  if (hasExpiration) {
    if (!expirationDays || expirationDays <= 0) {
      // template by neměl být v tomto stavu, ale chráníme se
      const err = new Error("Template hasExpiration=true but expirationDays is invalid");
      err.status = 400;
      throw err;
    }
    expiresAt = addDays(issuedAtDate, expirationDays).toISOString();
  }

  const item = {
    id: makeId("ccd"),
    templateId: String(tpl.id),
    name: nameOverride || safeString(tpl.name) || "Compliance",
    description: safeString(tpl.description),
    note: note || "",
    issuedAt: issuedAtDate.toISOString(),
    hasExpiration,
    expirationDays: hasExpiration ? expirationDays : null,
    notifyBeforeDays:
      hasExpiration ? Number(tpl.notifyBeforeDays ?? 30) : null,
    expiresAt,
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const docs = await readComplianceDocs(companyId);
  docs.push(item);
  await writeComplianceDocs(companyId, docs);

  await auditLog({
    companyId,
    actorRole,
    action: "companyComplianceDocument.createFromTemplate",
    entityType: "companyComplianceDocument",
    entityId: String(item.id),
    meta: { complianceDocumentId: String(item.id), templateId: String(tpl.id) },
    before: null,
    after: item,
  });

  return item;
}
