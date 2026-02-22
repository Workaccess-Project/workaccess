// backend/middleware/require-tenant.js

import { AUTH_MODE, IS_PROD } from "../config/auth-mode.js";

function sanitizeCompanyId(raw) {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;

  // Allowed safe ID (ready for folders/files in the future)
  // e.g. "acme", "globex-1", "tenant_123"
  const ok = /^[a-zA-Z0-9_-]{2,64}$/.test(s);
  if (!ok) return "__INVALID__";

  return s;
}

/**
 * requireTenant:
 * - enforces presence of companyId in request context
 * - companyId is taken from req.auth.companyId (set by auth middleware)
 * - stores sanitized value back
 */
export function requireTenant(req, res, next) {
  const sanitized = sanitizeCompanyId(req.auth?.companyId);

  const base = {
    mode: AUTH_MODE,
    path: req?.originalUrl,
    method: req?.method,
  };

  if (sanitized === "__INVALID__") {
    return res.status(400).json({
      error: "BadRequest",
      code: "TENANT_INVALID",
      message: "Invalid companyId. Allowed: 2-64 chars [a-zA-Z0-9_-].",
      details: {
        allowed: "^[a-zA-Z0-9_-]{2,64}$",
      },
      ...base,
    });
  }

  if (!sanitized) {
    // In production we never hint DEMO headers or internal auth details.
    const devHint =
      !IS_PROD && AUTH_MODE === "DEV"
        ? " Provide Authorization: Bearer <token> OR DEMO header x-company-id."
        : "";

    return res.status(400).json({
      error: "BadRequest",
      code: "TENANT_MISSING",
      message: `Missing companyId (tenant context is required).${devHint}`,
      ...base,
    });
  }

  req.auth.companyId = sanitized;
  next();
}