// backend/middleware/trial-guard.js
// NOTE: Upgraded in BOX #57.4 to support v36 billing model (company.billing.*)
// Kept filename for compatibility (index.js may import trialGuard).
// BOX #108 – Trial Expiration Enforcement
// - Automatically sets billingStatus = past_due for expired trial tenants

import { getCompanyProfile } from "../data-company.js";
import { BILLING_PLANS, BILLING_STATUS } from "../src/billing/billingModel.js";
import { writeTenantEntity } from "../data/tenant-store.js";

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

function isSubscriptionActiveLegacy(profile) {
  const status = safeString(profile?.subscriptionStatus).toLowerCase();
  if (status !== "active") return false;
  const end = safeString(profile?.subscriptionEnd);
  if (!end) return false;
  return !isExpiredIso(end);
}

function getBillingSnapshot(profile) {
  const b = profile?.billing && typeof profile.billing === "object" ? profile.billing : null;
  if (b) {
    return {
      source: "v36",
      plan: safeString(b.plan),
      billingStatus: safeString(b.billingStatus),
      trialEndsAt: safeString(b.trialEndsAt),
    };
  }
  // legacy fallback
  return {
    source: "legacy",
    plan: safeString(profile?.plan), // legacy plan: free/basic/pro
    billingStatus: "", // none
    trialEndsAt: safeString(profile?.trialEnd),
  };
}

/**
 * trialGuard (legacy name + BOX #108):
 * - must run after requireTenant
 * - upgraded to enforce v36 billing model
 * - persist expired trial as past_due
 *
 * Allowlist:
 * - /api/health
 * - /api/public/*
 * - /api/auth/*
 * - GET /api/company*
 * - /api/billing* (so user can fix billing)
 *
 * Enforcement:
 * - If legacy subscription is active -> allow (compat)
 * - If v36 billingStatus is past_due/unpaid/cancelled -> block with 402
 * - If v36 plan=trial and trialEndsAt is expired -> block with 402 and persist past_due
 * - Legacy: if trialEnd expired -> block with 402
 */
export async function trialGuard(req, res, next) {
  try {
    if (isPublicPath(req)) return next();
    if (isCompanyReadAllowed(req)) return next();
    if (isBillingAllowed(req)) return next();

    const companyId = req.auth?.companyId;
    if (!companyId) return next(); // requireTenant already enforces

    const profile = await getCompanyProfile(companyId);

    // legacy subscription active -> allow
    if (isSubscriptionActiveLegacy(profile)) return next();

    const snap = getBillingSnapshot(profile);

    // v36 enforcement
    if (snap.source === "v36") {
      const status = safeString(snap.billingStatus);

      // hard blocked states
      if ([BILLING_STATUS.PAST_DUE, BILLING_STATUS.UNPAID, BILLING_STATUS.CANCELLED].includes(status)) {
        return res.status(402).json({
          error: "TrialExpired",
          message: "Trial vypršel nebo billing není aktivní. Pro pokračování je potřeba aktivovat tarif.",
          companyId,
          billingStatus: status,
          plan: safeString(snap.plan),
          trialEndsAt: snap.trialEndsAt || null,
        });
      }

      // trialing but expired -> persist past_due
      if (safeString(snap.plan) === BILLING_PLANS.TRIAL && snap.trialEndsAt && isExpiredIso(snap.trialEndsAt)) {
        const now = new Date().toISOString();
        const nextCompany = {
          ...profile,
          billing: {
            ...(profile.billing || {}),
            billingStatus: BILLING_STATUS.PAST_DUE,
            updatedAt: now,
          },
          updatedAt: now,
        };
        await writeTenantEntity(companyId, "company", nextCompany);

        return res.status(402).json({
          error: "TrialExpired",
          message: "Trial vypršel. Pro pokračování je potřeba aktivovat tarif.",
          companyId,
          billingStatus: BILLING_STATUS.PAST_DUE,
          plan: safeString(snap.plan),
          trialEndsAt: snap.trialEndsAt,
        });
      }

      return next();
    }

    // legacy enforcement
    const trialEnd = safeString(profile?.trialEnd);
    if (!trialEnd) return next();
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
