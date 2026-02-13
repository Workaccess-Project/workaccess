// backend/auth.js

import { verifyAccessToken } from "./services/auth.service.js";

const ROLES = ["hr", "manager", "security", "external"];

/**
 * Získá roli z hlavičky (DEMO)
 */
function getRoleFromHeader(req) {
  const raw = (req.headers["x-role"] ?? "").toString().trim().toLowerCase();
  if (ROLES.includes(raw)) return raw;
  return "external";
}

function getBearerToken(req) {
  const header = (req.headers["authorization"] ?? "").toString().trim();
  if (!header) return null;

  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;

  return token.trim();
}

/**
 * Hlavní middleware – nastaví req.auth + req.role + případně req.user
 * Pravidlo:
 * - pokud je Authorization Bearer token → použije JWT (produkční cesta)
 * - pokud není token → použije DEMO x-role (kompatibilita)
 * - pokud token je, ale je neplatný → 401 (žádné tiché fallbacky)
 */
export function authMiddleware(req, res, next) {
  const token = getBearerToken(req);

  // 1) JWT cesta (má přednost)
  if (token) {
    try {
      const user = verifyAccessToken(token);

      req.user = user;
      req.auth = {
        role: user.role ?? "external",
        userId: user.id ?? null,
        companyId: user.companyId ?? null,
      };
      req.role = req.auth.role; // zpětná kompatibilita

      return next();
    } catch (err) {
      return res.status(err.statusCode || 401).json({
        error: "Unauthorized",
        message: err.message || "Neplatný token.",
      });
    }
  }

  // 2) DEMO cesta (x-role)
  const role = getRoleFromHeader(req);

  req.user = null;
  req.auth = {
    role,
    userId: null,
    companyId: null,
  };
  req.role = role; // zpětná kompatibilita

  next();
}

/**
 * Middleware: povolí jen role, které jsou v allowedRoles.
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const role = req.auth?.role ?? "external";

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Role '${role}' nemá oprávnění pro tuto akci.`,
        role,
        allowedRoles,
      });
    }

    next();
  };
}

export const requireWrite = requireRole(["hr", "manager"]);
