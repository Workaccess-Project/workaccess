// backend/auth.js

import { verifyAccessToken } from "./services/auth.service.js";

const ROLES = ["hr", "manager", "security", "external"];

function getRoleFromHeader(req) {
  const raw = (req.headers["x-role"] ?? "").toString().trim().toLowerCase();
  if (ROLES.includes(raw)) return raw;
  return "external";
}

function getCompanyIdFromHeader(req) {
  const raw = (req.headers["x-company-id"] ?? "").toString().trim();
  if (!raw) return null;
  return raw;
}

function getBearerToken(req) {
  const header = (req.headers["authorization"] ?? "").toString().trim();
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/**
 * authMiddleware:
 * - pokud je Authorization Bearer token → JWT (produkční cesta)
 * - pokud není token → DEMO x-role + x-company-id (fallback)
 *
 * BOX #3: companyId je povinné – žádné defaulty.
 */
export function authMiddleware(req, res, next) {
  const token = getBearerToken(req);

  // 1) JWT cesta
  if (token) {
    try {
      const user = verifyAccessToken(token);

      const role = user?.role ?? "external";
      const userId = user?.id ?? user?.userId ?? null;
      const companyId = user?.companyId ?? null;

      if (!companyId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Token is missing companyId (tenant context required).",
        });
      }

      req.user = user;
      req.auth = { role, userId, companyId };
      req.role = role;

      return next();
    } catch (err) {
      return res.status(err.statusCode || 401).json({
        error: "Unauthorized",
        message: err.message || "Neplatný token.",
      });
    }
  }

  // 2) DEMO cesta (bez JWT) – povinné x-company-id
  const role = getRoleFromHeader(req);
  const companyId = getCompanyIdFromHeader(req);

  if (!companyId) {
    return res.status(400).json({
      error: "BadRequest",
      message:
        "Missing companyId. Provide Authorization Bearer token OR DEMO header x-company-id.",
    });
  }

  req.user = null;
  req.auth = {
    role,
    userId: null,
    companyId,
  };
  req.role = role;

  next();
}

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
