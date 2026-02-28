// backend/middleware/role-guard-observe.js

import { AUTH_MODE, IS_PROD } from "../config/auth-mode.js";

/**
 * Role Guard OBSERVE middleware (no enforcement).
 *
 * Purpose:
 * - Prepare global pipeline for future RBAC enforcement.
 * - In v58.1 it only observes + logs (optional), never blocks.
 *
 * Enable logging by setting:
 *   WA_GUARD_OBSERVE=1
 */
export function roleGuardObserve(req, res, next) {
  const observe = (process.env.WA_GUARD_OBSERVE ?? "").toString().trim() === "1";
  if (!observe) return next();

  try {
    const role = req?.auth?.role ?? req?.role ?? "unknown";
    const companyId = req?.auth?.companyId ?? null;
    const path = (req?.originalUrl ?? "").toString();
    const method = (req?.method ?? "").toString();

    // Only observe API requests (avoid static files noise)
    if (!path.startsWith("/api")) return next();

    // We do NOT enforce anything yet. Only log anomalous states.
    // In prod, keep logs minimal (only warnings).
    const isWeird = role === "unknown" || role === "external" || !companyId;

    if (isWeird) {
      const msg = `[role-guard:observe] ${method} ${path} role=${role} companyId=${companyId ?? "null"} mode=${AUTH_MODE} prod=${IS_PROD}`;
      console.warn(msg);
    }

    return next();
  } catch (e) {
    // Never block requests in observe mode
    return next();
  }
}