// backend/middleware/trial-guard.js
import { getCompanyProfile } from "../data-company.js";

function safeString(v) {
  return (v ?? "").toString().trim();
}

function parseIso(v) {
  const s = safeString(v);
  if (!s) return null;
  const d = new Date(s);
  if (String(d) === "Invalid Date") return null;
  return d;
}

function isExpiredIso(iso) {
  const d = parseIso(iso);
  if (!d) return false;
  return d.getTime() < Date.now();
}

function isPublicPath(req) {
  const url = (req.originalUrl ?? req.url ?? "").toString();

  if (url.startsWith("/api/health")) return true;
  if (url.startsWith("/api/public")) return true;
  if (url.startsWith("/api/auth")) return true;

  return false;
}

function isCompanyReadAllowed(req) {
  const url = (req.originalUrl ?? req.url ?? "").toString();
  return req.method === "GET" && url.startsWith("/api/company");
}

function isBillingAllowed(req) {
  const url = (req.originalUrl ?? req.url ?? "").toString();
  return url.startsWith("/api/billing");
}

function isSubscriptionActive(profile) {
  const status = safeString(profile?.subscriptionStatus).toLowerCase();
  if (status !== "active") return false;

  const end = safeString(profile?.subscriptionEnd);
  if (!end) return false;

  return !isExpiredIso(end);
}

/**
 * trialGuard:
 * - vyžaduje tenant (companyId) -> proto musí být až po requireTenant
 * - načte company profil a zkontroluje trialEnd
 * - když vypršel -> 402 TrialExpired
 *   výjimky:
 *    - /api/health
 *    - /api/public/*
 *    - /api/auth/*
 *    - GET /api/company (read-only)
 *    - /api/billing/* (aby šlo aktivovat tarif i po expiraci)
 *   a navíc:
 *    - pokud je subscription aktivní (active + subscriptionEnd >= now) -> neblokujeme
 */
export async function trialGuard(req, res, next) {
  try {
    if (isPublicPath(req)) return next();
    if (isCompanyReadAllowed(req)) return next();
    if (isBillingAllowed(req)) return next();

    const companyId = req.auth?.companyId;
    if (!companyId) return next(); // requireTenant už by tohle řešil

    const profile = await getCompanyProfile(companyId);

    // subscription active -> allow
    if (isSubscriptionActive(profile)) return next();

    const trialEnd = profile?.trialEnd;
    if (!trialEnd) return next(); // pokud není trialEnd, neblokujeme (zatím)

    if (!isExpiredIso(trialEnd)) return next();

    return res.status(402).json({
      error: "TrialExpired",
      message: "Trial vypršel. Pro pokračování je potřeba aktivovat tarif.",
      companyId,
      trialEnd,
    });
  } catch (err) {
    next(err);
  }
}
