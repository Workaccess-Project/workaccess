// backend/middleware/require-tenant.js

function sanitizeCompanyId(raw) {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;

  // povolíme bezpečné ID (připravené na složky/soubory v budoucnu)
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

  if (sanitized === "__INVALID__") {
    return res.status(400).json({
      error: "BadRequest",
      message:
        "Invalid companyId. Allowed: 2-64 chars [a-zA-Z0-9_-].",
    });
  }

  if (!sanitized) {
    return res.status(400).json({
      error: "BadRequest",
      message: "Missing companyId (tenant context is required).",
    });
  }

  req.auth.companyId = sanitized;
  next();
}
