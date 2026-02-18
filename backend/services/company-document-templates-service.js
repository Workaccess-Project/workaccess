// backend/services/company-document-templates-service.js
import { readTenantEntity, writeTenantEntity } from "../data/tenant-store.js";
import { auditLog } from "../data-audit.js";

const ENTITY = "companyDocumentTemplates";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "cdt") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function requireCompanyId(companyId) {
  const c = (companyId ?? "").toString().trim();
  if (!c) {
    const err = new Error("Missing companyId (tenant context).");
    err.status = 400;
    throw err;
  }
  return c;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function toBool(v) {
  return !!v;
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeTemplateBody(body = {}) {
  const name = (body?.name ?? "").toString().trim();
  const description = (body?.description ?? "").toString().trim();

  const hasExpiration = toBool(body?.hasExpiration);
  const expirationDays = toIntOrNull(body?.expirationDays);
  const notifyBeforeDays = toIntOrNull(body?.notifyBeforeDays);

  if (!name) {
    const err = new Error("name je povinné");
    err.status = 400;
    err.payload = { required: ["name"] };
    throw err;
  }

  if (hasExpiration) {
    if (!expirationDays || expirationDays <= 0) {
      const err = new Error(
        "expirationDays je povinné a musí být > 0, pokud hasExpiration=true"
      );
      err.status = 400;
      err.payload = { required: ["expirationDays"] };
      throw err;
    }
  }

  const normalized = {
    name,
    description,
    hasExpiration,
    expirationDays: hasExpiration ? expirationDays : null,
    notifyBeforeDays: hasExpiration ? (notifyBeforeDays ?? 30) : null,
  };

  if (normalized.notifyBeforeDays != null && normalized.notifyBeforeDays < 0) {
    const err = new Error("notifyBeforeDays musí být >= 0");
    err.status = 400;
    throw err;
  }

  return normalized;
}

function findById(arr, id) {
  return arr.find((x) => String(x.id) === String(id)) || null;
}

async function readTemplates(companyId) {
  const cid = requireCompanyId(companyId);
  const arr = await readTenantEntity(cid, ENTITY);
  return asArray(arr);
}

async function writeTemplates(companyId, templates) {
  const cid = requireCompanyId(companyId);
  await writeTenantEntity(cid, ENTITY, templates);
}

// --- API ---

export async function listCompanyDocumentTemplates({ companyId }) {
  return await readTemplates(companyId);
}

export async function createCompanyDocumentTemplate({ companyId, actorRole, body }) {
  const templates = await readTemplates(companyId);
  const base = normalizeTemplateBody(body);

  const item = {
    id: makeId("cdt"),
    ...base,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  templates.push(item);
  await writeTemplates(companyId, templates);

  await auditLog({
    companyId,
    actorRole,
    action: "companyDocumentTemplate.create",
    entityType: "companyDocumentTemplate",
    entityId: String(item.id),
    meta: { templateId: String(item.id) },
    before: null,
    after: item,
  });

  return item;
}

export async function updateCompanyDocumentTemplate({ companyId, actorRole, id, body }) {
  const templates = await readTemplates(companyId);
  const idx = templates.findIndex((x) => String(x.id) === String(id));
  if (idx === -1) {
    const err = new Error("Template not found");
    err.status = 404;
    throw err;
  }

  const before = { ...templates[idx] };

  // merge body over current, then normalize/validate
  const merged = { ...before, ...(body || {}) };
  const patch = normalizeTemplateBody(merged);

  const next = {
    ...templates[idx],
    ...patch,
    updatedAt: nowIso(),
  };

  templates[idx] = next;
  await writeTemplates(companyId, templates);

  await auditLog({
    companyId,
    actorRole,
    action: "companyDocumentTemplate.update",
    entityType: "companyDocumentTemplate",
    entityId: String(id),
    meta: { templateId: String(id) },
    before,
    after: next,
  });

  return next;
}

export async function deleteCompanyDocumentTemplate({ companyId, actorRole, id }) {
  const templates = await readTemplates(companyId);
  const before = findById(templates, id);
  if (!before) {
    const err = new Error("Template not found");
    err.status = 404;
    throw err;
  }

  const next = templates.filter((x) => String(x.id) !== String(id));
  await writeTemplates(companyId, next);

  await auditLog({
    companyId,
    actorRole,
    action: "companyDocumentTemplate.delete",
    entityType: "companyDocumentTemplate",
    entityId: String(id),
    meta: { templateId: String(id) },
    before,
    after: null,
  });

  return { ok: true };
}