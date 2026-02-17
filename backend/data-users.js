// backend/data-users.js
import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";
import bcrypt from "bcryptjs";

const ENTITY = "users";

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

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function makeId(prefix = "usr") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeEmail(email) {
  return safeString(email).toLowerCase();
}

export async function listUsers(companyId) {
  const cid = requireCompanyId(companyId);
  const arr = await readTenantEntity(cid, ENTITY);
  return asArray(arr);
}

export async function getUserByEmail(companyId, email) {
  const cid = requireCompanyId(companyId);
  const e = normalizeEmail(email);
  if (!e) return null;

  const arr = await listUsers(cid);
  return arr.find((u) => normalizeEmail(u.email) === e) || null;
}

export async function createUser(companyId, body = {}) {
  const cid = requireCompanyId(companyId);

  const email = normalizeEmail(body.email);
  const password = safeString(body.password);
  const name = safeString(body.name);
  const role = safeString(body.role) || "external";

  if (!email || !password) {
    const err = new Error("Missing fields");
    err.status = 400;
    err.payload = { required: ["email", "password"] };
    throw err;
  }

  const existing = await getUserByEmail(cid, email);
  if (existing) {
    const err = new Error("User already exists");
    err.status = 409;
    err.payload = { field: "email" };
    throw err;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const user = {
    id: makeId("usr"),
    email,
    name,
    role,
    companyId: cid,
    passwordHash,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const arr = await listUsers(cid);
  arr.push(user);
  await writeTenantEntity(cid, ENTITY, arr);

  // bezpečný návrat bez hash
  const { passwordHash: _, ...safe } = user;
  return safe;
}
