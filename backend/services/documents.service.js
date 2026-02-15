// backend/services/documents.service.js
import fs from "fs/promises";
import path from "path";

import { auditLog } from "../data-audit.js";
import {
  addDocument,
  createDocumentId,
  getDocumentById,
  listDocuments,
  removeDocument,
} from "../data-documents.js";

function safeString(v) {
  return (v ?? "").toString();
}

function sanitizeFilename(name) {
  // keep it simple: replace dangerous chars
  const s = safeString(name).trim();
  if (!s) return "file";
  return s.replace(/[^\w.\-()\s]/g, "_");
}

function tenantFilesDir(companyId) {
  // backend runs with cwd = backend, so "data/..." is correct
  return path.join(process.cwd(), "data", "tenants", String(companyId), "files");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function listDocumentsService({ companyId } = {}) {
  return await listDocuments(companyId);
}

export async function uploadDocumentService({
  companyId,
  actorRole,
  file,
} = {}) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const e = new Error("Missing companyId");
    e.status = 400;
    throw e;
  }

  if (!file) {
    const e = new Error("Missing file");
    e.status = 400;
    throw e;
  }

  const dir = tenantFilesDir(cid);
  await ensureDir(dir);

  const docId = createDocumentId();
  const originalName = sanitizeFilename(file.originalname);
  const storedName = `${docId}__${originalName}`;
  const fullPath = path.join(dir, storedName);

  // multer memoryStorage -> buffer exists
  if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
    const e = new Error("Invalid upload (missing file buffer)");
    e.status = 400;
    throw e;
  }

  await fs.writeFile(fullPath, file.buffer);

  const meta = await addDocument(cid, {
    id: docId,
    originalName,
    storedName,
    mimeType: safeString(file.mimetype),
    size: Number(file.size || 0) || 0,
    uploadedAt: new Date().toISOString(),
    uploadedByRole: safeString(actorRole || "unknown"),
  });

  await auditLog({
    companyId: cid,
    actorRole,
    action: "document.upload",
    entityType: "document",
    entityId: meta.id,
    meta: {
      originalName: meta.originalName,
      mimeType: meta.mimeType,
      size: meta.size,
    },
    before: null,
    after: meta,
  });

  return meta;
}

export async function downloadDocumentService({
  companyId,
  actorRole,
  id,
} = {}) {
  const cid = safeString(companyId).trim();
  const docId = safeString(id).trim();

  if (!cid) {
    const e = new Error("Missing companyId");
    e.status = 400;
    throw e;
  }
  if (!docId) {
    const e = new Error("Missing id");
    e.status = 400;
    throw e;
  }

  const doc = await getDocumentById(cid, docId);
  if (!doc) {
    const e = new Error("Document not found");
    e.status = 404;
    throw e;
  }

  const fullPath = path.join(tenantFilesDir(cid), doc.storedName);

  // ensure file exists
  try {
    await fs.access(fullPath);
  } catch {
    const e = new Error("Document file is missing on disk");
    e.status = 404;
    throw e;
  }

  await auditLog({
    companyId: cid,
    actorRole,
    action: "document.download",
    entityType: "document",
    entityId: doc.id,
    meta: { originalName: doc.originalName },
    before: null,
    after: null,
  });

  return { doc, fullPath };
}

export async function deleteDocumentService({
  companyId,
  actorRole,
  id,
} = {}) {
  const cid = safeString(companyId).trim();
  const docId = safeString(id).trim();

  if (!cid) {
    const e = new Error("Missing companyId");
    e.status = 400;
    throw e;
  }
  if (!docId) {
    const e = new Error("Missing id");
    e.status = 400;
    throw e;
  }

  const existing = await getDocumentById(cid, docId);
  if (!existing) {
    const e = new Error("Document not found");
    e.status = 404;
    throw e;
  }

  const fullPath = path.join(tenantFilesDir(cid), existing.storedName);

  // remove metadata first (single source of truth)
  const removed = await removeDocument(cid, docId);
  if (!removed.ok) {
    const e = new Error("Document not found");
    e.status = 404;
    throw e;
  }

  // remove file (best effort; if missing, still ok)
  try {
    await fs.unlink(fullPath);
  } catch {
    // ignore
  }

  await auditLog({
    companyId: cid,
    actorRole,
    action: "document.delete",
    entityType: "document",
    entityId: existing.id,
    meta: { originalName: existing.originalName },
    before: existing,
    after: null,
  });

  return { ok: true };
}
