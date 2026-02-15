// backend/data-documents.js
import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "doc") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

async function writeDb(companyId, arr) {
  await writeTenantEntity(companyId, "documents", arr);
}

async function readDb(companyId) {
  const data = await readTenantEntity(companyId, "documents");
  if (!Array.isArray(data)) throw new Error("documents.json must be an array");
  return data;
}

export function createDocumentId() {
  return makeId("doc");
}

export async function listDocuments(companyId) {
  const arr = await readDb(companyId);
  // newest first
  return arr
    .slice()
    .sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
}

export async function getDocumentById(companyId, id) {
  const arr = await readDb(companyId);
  return arr.find((x) => String(x.id) === String(id)) || null;
}

export async function addDocument(companyId, doc) {
  const arr = await readDb(companyId);

  const item = {
    id: String(doc?.id ?? makeId("doc")),
    originalName: (doc?.originalName ?? "").toString(),
    storedName: (doc?.storedName ?? "").toString(),
    mimeType: (doc?.mimeType ?? "").toString(),
    size: Number(doc?.size ?? 0) || 0,
    uploadedAt: (doc?.uploadedAt ?? nowIso()).toString(),
    uploadedByRole: (doc?.uploadedByRole ?? "unknown").toString(),
  };

  arr.push(item);
  await writeDb(companyId, arr);
  return item;
}

export async function removeDocument(companyId, id) {
  const arr = await readDb(companyId);
  const idx = arr.findIndex((x) => String(x.id) === String(id));
  if (idx === -1) return { ok: false, removed: null };

  const removed = arr[idx];
  const next = arr.slice();
  next.splice(idx, 1);

  await writeDb(companyId, next);
  return { ok: true, removed };
}
