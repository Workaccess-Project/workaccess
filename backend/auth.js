// backend/auth.js

const ROLES = ["hr", "manager", "security", "external"];

/**
 * MODE:
 * "demo"  → role z hlavičky x-role
 * "auth"  → role z budoucí autentizace (JWT, session...)
 */
const AUTH_MODE = "demo"; // později přepneme na "auth"

/**
 * Získá roli z hlavičky (DEMO)
 */
function getRoleFromHeader(req) {
  const raw = (req.headers["x-role"] ?? "").toString().trim().toLowerCase();
  if (ROLES.includes(raw)) return raw;
  return "external";
}

/**
 * Hlavní middleware – nastaví req.auth
 */
export function authMiddleware(req, res, next) {
  let role = "external";

  if (AUTH_MODE === "demo") {
    role = getRoleFromHeader(req);
  }

  // připraveno na budoucí:
  // if (AUTH_MODE === "auth") {
  //   role = req.user?.role ?? "external";
  // }

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
