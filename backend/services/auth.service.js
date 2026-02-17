// backend/services/auth.service.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";
import { getUserByEmail } from "../data-users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tenant dirs are here: backend/data/tenants/<companyId>
const TENANTS_DIR = path.join(__dirname, "..", "data", "tenants");

function safeString(v) {
  return (v ?? "").toString().trim();
}

function normalizeEmail(v) {
  return safeString(v).toLowerCase();
}

/**
 * Legacy fallback admin user (ENV)
 * - zachováváme kompatibilitu pro DEV / staré flow
 */
function getAdminUserFromEnv() {
  const email = process.env.WA_ADMIN_EMAIL || "admin@workaccess.local";
  const password = process.env.WA_ADMIN_PASSWORD || "admin";
  const role = process.env.WA_ADMIN_ROLE || "hr";
  const companyId = process.env.WA_ADMIN_COMPANY_ID || "demo-company";

  const passwordHash = bcrypt.hashSync(password, 10);

  return {
    id: "admin-1",
    email: normalizeEmail(email),
    role,
    companyId,
    passwordHash,
  };
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function listTenants() {
  try {
    const items = await fs.readdir(TENANTS_DIR, { withFileTypes: true });
    return items.filter((x) => x.isDirectory()).map((x) => x.name);
  } catch {
    return [];
  }
}

async function findUserAcrossTenantsByEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return null;

  const tenants = await listTenants();

  for (const companyId of tenants) {
    const u = await getUserByEmail(companyId, e);
    if (u) return u;
  }

  return null;
}

export async function loginWithPassword({ email, password }) {
  const e = normalizeEmail(email);
  const p = safeString(password);

  if (!e || !p) {
    const err = new Error("Email a heslo jsou povinné.");
    err.statusCode = 400;
    throw err;
  }

  // 1) Try tenant users (users.json per tenant)
  const user = await findUserAcrossTenantsByEmail(e);

  if (user) {
    const ok = await bcrypt.compare(p, safeString(user.passwordHash));
    if (!ok) {
      const err = new Error("Neplatné přihlašovací údaje.");
      err.statusCode = 401;
      throw err;
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      name: user.name || "",
    };

    const token = signAccessToken(safeUser);
    return { user: safeUser, token };
  }

  // 2) Legacy ENV admin fallback
  const admin = getAdminUserFromEnv();

  if (e !== normalizeEmail(admin.email)) {
    const err = new Error("Neplatné přihlašovací údaje.");
    err.statusCode = 401;
    throw err;
  }

  const ok = await bcrypt.compare(p, admin.passwordHash);
  if (!ok) {
    const err = new Error("Neplatné přihlašovací údaje.");
    err.statusCode = 401;
    throw err;
  }

  const safeAdmin = {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    companyId: admin.companyId,
    name: "Admin",
  };

  const token = signAccessToken(safeAdmin);
  return { user: safeAdmin, token };
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
    };
  } catch (e) {
    const err = new Error("Neplatný nebo expirovaný token.");
    err.statusCode = 401;
    throw err;
  }
}
