// backend/middleware/trial-guard.js
import { getCompanyProfile } from "../data-company.js";

function safeString(v) {
  return (v ?? "").toString().trim();
}

function isTrialExpired(trialEndIso) {
  const s = safeString(trialEndIso);
  if (!s) return false;

  const d = new Date(s);
  if (String(d) === "Invalid Date") return false;

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

/**
 * trialGuard:
 * - vyžaduje tenant (companyId) -> proto musí být až po requireTenant
 * - načte company profil a zkontroluje trialEnd
 * - když vypršelo -> 402 TrialExpired (kromě public/auth/health + GET /api/company)
 */
export async function trialGuard(req, res, next) {
  try {
    if (isPublicPath(req)) return next();
    if (isCompanyReadAllowed(req)) return next();

    const companyId = req.auth?.companyId;
    if (!companyId) return next(); // requireTenant už by tohle řešil

    const profile = await getCompanyProfile(companyId);
    const trialEnd = profile?.trialEnd;

    if (!trialEnd) return next(); // pokud není trialEnd, neblokujeme (zatím)

    if (!isTrialExpired(trialEnd)) return next();

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
