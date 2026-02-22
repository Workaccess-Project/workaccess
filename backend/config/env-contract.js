// backend/config/env-contract.js
//
// Production ENV Contract Layer (fail-fast)
//
// Goal:
// - In production, required ENV must exist and be safe.
// - No dangerous defaults (e.g., dev JWT secret).
// - No "half-configured" SMTP.
// - Make bad deployments impossible.
//
// This module should be imported at the very top of backend/index.js
// so the process crashes BEFORE the server starts.

function readEnv(name) {
  const v = process.env[name];
  return v == null ? null : v.toString().trim();
}

function failFast(msg) {
  throw new Error(`[ENV_CONTRACT] ${msg}`);
}

const NODE_ENV = (readEnv("NODE_ENV") ?? "development").toLowerCase();
export const IS_PROD = NODE_ENV === "production";

// ---- Required in production ----
export function enforceProductionEnvContract() {
  if (!IS_PROD) return; // dev/staging stays flexible

  // PORT must be explicit in prod (no silent fallback)
  const portRaw = readEnv("PORT");
  if (!portRaw) failFast(`PORT is required in production.`);

  const portNum = Number(portRaw);
  if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
    failFast(`PORT must be a valid TCP port number (got "${portRaw}").`);
  }

  // CORS_ORIGINS must be explicit in prod
  const corsRaw = readEnv("CORS_ORIGINS");
  if (!corsRaw) {
    failFast(`CORS_ORIGINS is required in production (comma-separated origins).`);
  }

  const origins = corsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    failFast(`CORS_ORIGINS is required in production (cannot be empty).`);
  }

  // basic sanity: must look like http(s)://...
  for (const o of origins) {
    const ok = o.startsWith("https://") || o.startsWith("http://");
    if (!ok) {
      failFast(`CORS_ORIGINS contains invalid origin "${o}" (must start with http:// or https://).`);
    }
  }

  // JWT_SECRET must be explicit and not the dev fallback
  const jwtSecret = readEnv("JWT_SECRET");
  if (!jwtSecret) failFast(`JWT_SECRET is required in production.`);
  if (jwtSecret === "dev-secret-change-me") {
    failFast(`JWT_SECRET must not be the dev default in production.`);
  }
  if (jwtSecret.length < 32) {
    failFast(`JWT_SECRET must be at least 32 characters in production.`);
  }

  // Optional build metadata should not break anything (no validation needed)

  // SMTP: allow OFF (all empty) OR ON (all required set) — never partial
  const smtpHost = readEnv("SMTP_HOST") ?? "";
  const smtpUser = readEnv("SMTP_USER") ?? "";
  const smtpPass = readEnv("SMTP_PASS") ?? "";
  const smtpPortRaw = readEnv("SMTP_PORT") ?? "";
  const smtpOnSignals = [smtpHost, smtpUser, smtpPass, smtpPortRaw].filter(Boolean).length;

  if (smtpOnSignals > 0 && smtpOnSignals < 4) {
    failFast(
      `SMTP is partially configured. Either set all of SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS or set none.`
    );
  }

  if (smtpOnSignals === 4) {
    const p = Number(smtpPortRaw);
    if (!Number.isFinite(p) || p <= 0 || p > 65535) {
      failFast(`SMTP_PORT must be a valid TCP port number (got "${smtpPortRaw}").`);
    }
  }
}
