// backend/config/jwt.js
//
// JWT config (defense-in-depth)
// - DEV: allows fallback secret (for local development only)
// - PROD: JWT_SECRET must be explicitly set and safe

function readEnv(name) {
  const v = process.env[name];
  return v == null ? null : v.toString().trim();
}

function failFast(msg) {
  throw new Error(`[JWT_CONFIG] ${msg}`);
}

const NODE_ENV = (readEnv("NODE_ENV") ?? "development").toLowerCase();
const IS_PROD = NODE_ENV === "production";

const DEV_FALLBACK_SECRET = "dev-secret-change-me";

const secret = readEnv("JWT_SECRET") ?? "";

if (IS_PROD) {
  if (!secret) failFast(`JWT_SECRET is required in production.`);
  if (secret === DEV_FALLBACK_SECRET) {
    failFast(`JWT_SECRET must not be the dev default in production.`);
  }
  if (secret.length < 32) {
    failFast(`JWT_SECRET must be at least 32 characters in production.`);
  }
}

// In dev, allow fallback to keep local DX simple.
// In prod, this path is unreachable due to checks above.
export const JWT_SECRET = secret || DEV_FALLBACK_SECRET;

// Optional: expiry can stay configurable; default is safe enough for MVP.
export const JWT_EXPIRES_IN = readEnv("JWT_EXPIRES_IN") || "7d";
