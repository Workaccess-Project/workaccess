// backend/middleware/require-tenant.js

import { AUTH_MODE } from "../config/auth-mode.js";

function sanitizeCompanyId(raw) {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;

  // Povolíme bezpečné ID (připravené na složky/soubory v budoucnu)
  // např. "acme", "globex-1", "tenant_123"
  const ok = /^[a-zA-Z0-9_-]{2,64}$/.test(s);
  if (!ok) return "__INVALID__";

  return s;
}

/**
 * requireTenant:
 * - vynucuje přítomnost companyId na requestu
 * - companyId bere z req.auth.companyId (nastavuje authMiddleware)
 * - ukládá sanitized hodnotu zpět
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
    const devHint =
      AUTH_MODE === "DEV"
        ? " Provide Authorization Bearer token OR DEMO header x-company-id."
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