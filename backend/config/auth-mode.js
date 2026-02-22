// backend/config/auth-mode.js

/**
 * AUTH MODE
 *
 * Supported:
 * - DEV      : allows DEMO fallback headers (x-company-id, x-role) (development only)
 * - JWT_ONLY : requires Authorization: Bearer <token> for all protected routes
 *
 * Env:
 *   AUTH_MODE=DEV
 *   AUTH_MODE=JWT_ONLY
 *
 * Production rules (LOCK):
 * - AUTH_MODE must be explicitly set
 * - AUTH_MODE cannot be DEV in production
 * - invalid values => fail-fast on startup
 */

function readEnv(name) {
  const v = process.env[name];
  return v == null ? null : v.toString().trim();
}

function failFast(msg) {
  // throw to crash startup (intentionally)
  throw new Error(`[CONFIG_LOCK] ${msg}`);
}

const NODE_ENV = (readEnv("NODE_ENV") ?? "development").toLowerCase();
export const IS_PROD = NODE_ENV === "production";

const rawMode = readEnv("AUTH_MODE");
const normalizedMode = (rawMode ?? "DEV").toUpperCase();

const ALLOWED = new Set(["DEV", "JWT_ONLY"]);

if (!ALLOWED.has(normalizedMode)) {
  failFast(`AUTH_MODE has invalid value "${rawMode}". Allowed: DEV, JWT_ONLY.`);
}

if (IS_PROD) {
  if (!rawMode) {
    failFast(`AUTH_MODE is required in production (set AUTH_MODE=JWT_ONLY).`);
  }
  if (normalizedMode !== "JWT_ONLY") {
    failFast(`AUTH_MODE must be JWT_ONLY in production (got "${normalizedMode}").`);
  }
}

export const AUTH_MODE = normalizedMode;
export const IS_JWT_ONLY = AUTH_MODE === "JWT_ONLY";