// backend/middleware/feature-guard-observe.js

import { AUTH_MODE, IS_PROD } from "../config/auth-mode.js";

/**
 * Feature Guard OBSERVE middleware (no enforcement).
 *
 * Purpose:
 * - Prepare global pipeline for future feature/module gating.
 * - In v58.1 it only observes + logs (optional), never blocks.
 *
 * Enable logging by setting:
 *   WA_GUARD_OBSERVE=1
 */
export function featureGuardObserve(req, res, next) {
  const observe = (process.env.WA_GUARD_OBSERVE ?? "").toString().trim() === "1";
  if (!observe) return next();

  try {
    const companyId = req?.auth?.companyId ?? null;
    const path = (req?.originalUrl ?? "").toString();
    const method = (req?.method ?? "").toString();

    // Only observe API requests (avoid static files noise)
    if (!path.startsWith("/api")) return next();

    // In v58.1 we don't know feature map globally yet, so we only log missing tenant context anomalies.
    // (Tenant should already be enforced by requireTenant, so this should normally never happen.)
    if (!companyId) {
      const msg = `[feature-guard:observe] ${method} ${path} companyId=null mode=${AUTH_MODE} prod=${IS_PROD}`;
      console.warn(msg);
    }

    return next();
  } catch (e) {
    // Never block requests in observe mode
    return next();
  }
}