// backend/auth.js

const ROLES = ["hr", "manager", "security", "external"];

export function getRole(req) {
  const raw = (req.headers["x-role"] ?? "").toString().trim().toLowerCase();
  if (ROLES.includes(raw)) return raw;
  // default (když chybí) – pro jednoduchost HR, protože jsi v interním toolu
  return "hr";
}

/**
 * Middleware: povolí jen role, které jsou v allowedRoles.
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const role = getRole(req);
    req.role = role;

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

/**
 * Helper: "write" akce povolíme jen HR + manager
 */
export const requireWrite = requireRole(["hr", "manager"]);
