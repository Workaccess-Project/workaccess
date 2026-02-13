// backend/services/auth.service.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";

/**
 * Pro stabilní start bez DB:
 * - 1 admin účet přes ENV
 * - připravené na pozdější DB (jen vyměníme implementaci)
 */
function getAdminUser() {
  const email = process.env.WA_ADMIN_EMAIL || "admin@workaccess.local";
  const password = process.env.WA_ADMIN_PASSWORD || "admin";
  const role = process.env.WA_ADMIN_ROLE || "hr";
  const companyId = process.env.WA_ADMIN_COMPANY_ID || "demo-company";

  // hash vypočítáme při běhu (dev-friendly), později bude v DB
  const passwordHash = bcrypt.hashSync(password, 10);

  return {
    id: "admin-1",
    email,
    role,
    companyId,
    passwordHash,
  };
}

export async function loginWithPassword({ email, password }) {
  const admin = getAdminUser();

  if (!email || !password) {
    const err = new Error("Email a heslo jsou povinné.");
    err.statusCode = 400;
    throw err;
  }

  if (email.toLowerCase() !== admin.email.toLowerCase()) {
    const err = new Error("Neplatné přihlašovací údaje.");
    err.statusCode = 401;
    throw err;
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    const err = new Error("Neplatné přihlašovací údaje.");
    err.statusCode = 401;
    throw err;
  }

  const user = {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    companyId: admin.companyId,
  };

  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return { user, token };
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
