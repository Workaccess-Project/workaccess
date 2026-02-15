// backend/config/auth-mode.js

/**
 * AUTH MODE
 *
 * - DEV (default): allows DEMO fallback headers (x-company-id, x-role)
 * - JWT_ONLY: requires Authorization: Bearer <token> for all protected routes
 *
 * Set via env:
 *   AUTH_MODE=DEV
 *   AUTH_MODE=JWT_ONLY
 */

export const AUTH_MODE = (process.env.AUTH_MODE ?? "DEV")
  .toString()
  .trim()
  .toUpperCase();

export const IS_JWT_ONLY = AUTH_MODE === "JWT_ONLY";
