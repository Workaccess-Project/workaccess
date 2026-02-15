// backend/data-contacts.js
import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";

const ENTITY = "contacts";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "cnt") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
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

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeContactBody(body = {}, prev = {}) {
  return {
    name: safeString(body.name ?? prev.name),
    email: safeString(body.email ?? prev.email),
    phone: safeString(body.phone ?? prev.phone),
    company: safeString(body.company ?? prev.company),
    note: safeString(body.note ?? prev.note),
    tags: Array.isArray(body.tags) ? body.tags.map((x) => safeString(x)).filter(Boolean) : (prev.tags ?? []),
  };
}

async function readContacts(companyId) {
  const cid = requireCompanyId(companyId);
  const arr = await readTenantEntity(cid, ENTITY);
  return asArray(arr);
}

async function writeContacts(companyId, arr) {
  const cid = requireCompanyId(companyId);
  await writeTenantEntity(cid, ENTITY, asArray(arr));
}

export async function listContacts(companyId) {
  const arr = await readContacts(companyId);
  // newest first
  return arr
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function getContactById(companyId, id) {
  const arr = await readContacts(companyId);
  return arr.find((x) => String(x.id) === String(id)) || null;
}

export async function createContact(companyId, body) {
  const cid = requireCompanyId(companyId);
  const arr = await readContacts(cid);

  const base = normalizeContactBody(body, {});
  if (!base.name) {
    const err = new Error("Missing fields");
    err.status = 400;
    err.payload = { required: ["name"] };
    throw err;
  }

  const item = {
    id: makeId("cnt"),
    ...base,
    updatedAt: nowIso(),
    createdAt: nowIso(),
  };

  arr.push(item);
  await writeContacts(cid, arr);
  return item;
}

export async function updateContact(companyId, id, body) {
  const cid = requireCompanyId(companyId);
  const arr = await readContacts(cid);

  const idx = arr.findIndex((x) => String(x.id) === String(id));
  if (idx === -1) {
    const err = new Error("Contact not found");
    err.status = 404;
    throw err;
  }

  const before = { ...arr[idx] };
  const patch = normalizeContactBody(body, before);

  if (!patch.name) {
    const err = new Error("Missing fields");
    err.status = 400;
    err.payload = { required: ["name"] };
    throw err;
  }

  const next = {
    ...before,
    ...patch,
    updatedAt: nowIso(),
  };

  arr[idx] = next;
  await writeContacts(cid, arr);

  return { before, after: next };
}

export async function deleteContact(companyId, id) {
  const cid = requireCompanyId(companyId);
  const arr = await readContacts(cid);

  const before = arr.find((x) => String(x.id) === String(id)) || null;
  if (!before) {
    const err = new Error("Contact not found");
    err.status = 404;
    throw err;
  }

  const next = arr.filter((x) => String(x.id) !== String(id));
  await writeContacts(cid, next);

  return { before, after: null };
}
