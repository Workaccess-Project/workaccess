// backend/auth.js

import { verifyAccessToken } from "./services/auth.service.js";
import { IS_JWT_ONLY, AUTH_MODE, IS_PROD } from "./config/auth-mode.js";

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

function isPublicAuthLogin(req) {
  // authMiddleware is global, so login must pass without token/companyId
  const url = (req.originalUrl ?? req.url ?? "").toString();
  return req.method === "POST" && url.startsWith("/api/auth/login");
}

/**
 * authMiddleware:
 * - If Authorization Bearer token is present -> JWT path
 * - If token is missing:
 *    - Allow POST /api/auth/login as public (even in JWT_ONLY / production)
 *    - Production: always reject (no demo headers)
 *    - JWT_ONLY: reject with 401
 *    - DEV (jwtOnly=false): allow DEMO headers fallback (x-role + optional x-company-id)
 *
 * Tenant (companyId) enforcement is handled by requireTenant middleware.
 */
export function authMiddleware(req, res, next) {
  const token = getBearerToken(req);

  // 0) Public login must pass without token/companyId
  if (!token && isPublicAuthLogin(req)) {
    req.user = null;
    req.auth = { role: "external", userId: null, companyId: null };
    req.role = "external";
    return next();
  }

  // 1) JWT path
  if (token) {
    try {
      const user = verifyAccessToken(token);

      const role = user?.role ?? "external";
      const userId = user?.id ?? user?.userId ?? null;
      const companyId = user?.companyId ?? null;

      // Token without tenant context is not usable for tenant-scoped APIs
      if (!companyId) {
        return res.status(401).json({
          error: "Unauthorized",
          code: "TOKEN_TENANT_MISSING",
          message: "Token is missing companyId (tenant context required).",
          mode: AUTH_MODE,
        });
      }

      req.user = user;
      req.auth = { role, userId, companyId };
      req.role = role;

      return next();
    } catch (err) {
      return res.status(err?.statusCode || 401).json({
        error: "Unauthorized",
        code: "TOKEN_INVALID",
        message: err?.message || "Neplatný token.",
        mode: AUTH_MODE,
      });
    }
  }

  // 2) No token present — HARD LOCK rules
  // Production must NEVER allow DEMO headers.
  if (IS_PROD) {
    return res.status(401).json({
      error: "Unauthorized",
      code: "JWT_REQUIRED",
      message: "Authentication required. Provide Authorization: Bearer <token>.",
      mode: AUTH_MODE,
    });
  }

  // JWT-only mode (also covers staging/dev when AUTH_MODE=JWT_ONLY)
  if (IS_JWT_ONLY) {
    return res.status(401).json({
      error: "Unauthorized",
      code: "JWT_ONLY",
      message: "JWT-only mode is enabled. Provide Authorization: Bearer <token>.",
      mode: AUTH_MODE,
    });
  }

  // 3) DEV DEMO fallback (no JWT)
  // IMPORTANT: companyId is optional here; requireTenant enforces it for tenant-scoped APIs.
  const role = getRoleFromHeader(req);
  const companyId = getCompanyIdFromHeader(req);

  req.user = null;
  req.auth = {
    role,
    userId: null,
    companyId, // may be null -> requireTenant will return TENANT_MISSING
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
        code: "FORBIDDEN",
        message: `Role '${role}' nemá oprávnění pro tuto akci.`,
        role,
        allowedRoles,
        mode: AUTH_MODE,
        path: req?.originalUrl,
        method: req?.method,
      });
    }

    next();
  };
}

export const requireWrite = requireRole(["hr", "manager"]);