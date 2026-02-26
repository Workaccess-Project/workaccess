// backend/routes/billing.js
// Upgraded in BOX #57.5 to use v36 billing model (company.billing.*)
// Legacy trial/subscription fields are kept for backward compatibility.

import express from "express";
import { requireRole } from "../auth.js";
import { getCompanyProfile } from "../data-company.js";
import { writeTenantEntity } from "../data/tenant-store.js";
import { auditLog } from "../data-audit.js";
import { BILLING_PLANS, BILLING_STATUS, validateBillingProfile } from "../src/billing/billingModel.js";

const router = express.Router();

function safeString(v) {
  return (v ?? "").toString().trim();
}

function nowIso() {
  return new Date().toISOString();
}

function parseIsoOrEmpty(v) {
  const s = safeString(v);
  if (!s) return "";
  const d = new Date(s);
  if (String(d) === "Invalid Date") return "";
  return d.toISOString();
}

function isExpiredIso(iso) {
  const s = safeString(iso);
  if (!s) return false;
  const d = new Date(s);
  if (String(d) === "Invalid Date") return false;
  return d.getTime() < Date.now();
}

function normalizePlanToV36(planRaw) {
  const p = safeString(planRaw).toLowerCase();
  if (p === BILLING_PLANS.TRIAL) return BILLING_PLANS.TRIAL;
  if (p === BILLING_PLANS.BASIC) return BILLING_PLANS.BASIC;
  if (p === BILLING_PLANS.PRO) return BILLING_PLANS.PRO;
  if (p === BILLING_PLANS.ENTERPRISE) return BILLING_PLANS.ENTERPRISE;

  // legacy mapping
  if (p === "free") return BILLING_PLANS.TRIAL;
  if (p === "basic") return BILLING_PLANS.BASIC;
  if (p === "pro") return BILLING_PLANS.PRO;

  return BILLING_PLANS.BASIC;
}

function computeLockedFromBilling(billing) {
  const st = safeString(billing?.billingStatus);
  if ([BILLING_STATUS.PAST_DUE, BILLING_STATUS.UNPAID, BILLING_STATUS.CANCELLED].includes(st)) {
    return true;
  }

  // Defensive: trialing but expired -> locked
  const plan = safeString(billing?.plan);
  const te = safeString(billing?.trialEndsAt);
  if (plan === BILLING_PLANS.TRIAL && te && isExpiredIso(te)) return true;

  return false;
}

/**
 * GET /api/billing/status
 * READ: for all roles (tenant scoped)
 *
 * Returns v36 billing as primary.
 * Also includes legacy trial/subscription fields for backward compatibility.
 */
router.get("/status", async (req, res) => {
  const companyId = req.auth.companyId;
  const profile = await getCompanyProfile(companyId);

  const billing = profile?.billing ?? null;

  const locked = computeLockedFromBilling(billing);

  res.json({
    companyId,
    billing, // v36 canonical
    isLocked: locked,

    // legacy snapshot (kept for older UIs / diagnostics)
    legacy: {
      trial: {
        start: profile?.trialStart ?? "",
        end: profile?.trialEnd ?? "",
        expired: isExpiredIso(profile?.trialEnd ?? ""),
      },
      subscription: {
        status: profile?.subscriptionStatus ?? "none",
        plan: profile?.plan ?? "free",
        paymentProvider: profile?.paymentProvider ?? "",
        start: profile?.subscriptionStart ?? "",
        end: profile?.subscriptionEnd ?? "",
        active:
          safeString(profile?.subscriptionStatus).toLowerCase() === "active" &&
          !!safeString(profile?.subscriptionEnd) &&
          !isExpiredIso(profile?.subscriptionEnd),
        expired: isExpiredIso(profile?.subscriptionEnd ?? ""),
      },
    },
  });
});

/**
 * POST /api/billing/activate
 * WRITE: manager only
 *
 * Body:
 *  - plan: "basic"|"pro"|"enterprise" (string)  (trial is not activated here)
 *
 * Effects:
 * - Sets company.billing.plan + billingStatus=active
 * - Keeps legacy subscription fields updated (manual provider) for compatibility
 */
router.post("/activate", requireRole(["manager"]), async (req, res) => {
  const companyId = req.auth.companyId;

  const before = await getCompanyProfile(companyId);

  const plan = normalizePlanToV36(req.body?.plan);
  if (plan === BILLING_PLANS.TRIAL) {
    return res.status(400).json({
      error: "BadRequest",
      code: "PLAN_INVALID",
      message: "Activate expects a paid plan (basic/pro/enterprise).",
      allowed: [BILLING_PLANS.BASIC, BILLING_PLANS.PRO, BILLING_PLANS.ENTERPRISE],
    });
  }

  const now = nowIso();

  const subscriptionEnd = (() => {
    const untilIso = parseIsoOrEmpty(req.body?.until);
    const daysRaw = Number(req.body?.days);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(3650, Math.floor(daysRaw))) : 30;
    if (untilIso) return untilIso;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  })();

  const nextCompany = {
    ...before,
    billing: {
      ...(before.billing || {}),
      plan,
      billingStatus: BILLING_STATUS.ACTIVE,
      updatedAt: now,
    },

    // legacy compatibility (manual subscription mirror)
    subscriptionStatus: "active",
    plan: plan === BILLING_PLANS.ENTERPRISE ? "pro" : plan, // legacy doesn't have enterprise
    paymentProvider: "manual",
    subscriptionStart: now,
    subscriptionEnd,

    updatedAt: now,
  };

  const v = validateBillingProfile(nextCompany.billing);
  if (!v.ok) {
    return res.status(500).json({
      error: "BillingInvalid",
      message: "Internal billing profile validation failed.",
      errors: v.errors,
    });
  }
  nextCompany.billing = v.normalized;

  await writeTenantEntity(companyId, "company", nextCompany);

  await auditLog({
    companyId,
    actorRole: req.role,
    action: "billing.activate",
    entityType: "company",
    entityId: companyId,
    meta: { plan, paymentProvider: "manual" },
    before: { billing: before.billing ?? null, legacy: { subscriptionStatus: before.subscriptionStatus ?? "none", plan: before.plan ?? "free" } },
    after: { billing: nextCompany.billing ?? null, legacy: { subscriptionStatus: nextCompany.subscriptionStatus, plan: nextCompany.plan } },
  });

  res.json({
    ok: true,
    companyId,
    billing: nextCompany.billing,
  });
});

/**
 * POST /api/billing/cancel
 * WRITE: manager only
 *
 * Effects:
 * - Sets v36 billingStatus=cancelled
 * - Mirrors legacy subscriptionStatus=canceled
 */
router.post("/cancel", requireRole(["manager"]), async (req, res) => {
  const companyId = req.auth.companyId;

  const before = await getCompanyProfile(companyId);
  const now = nowIso();

  const nextCompany = {
    ...before,
    billing: {
      ...(before.billing || {}),
      billingStatus: BILLING_STATUS.CANCELLED,
      updatedAt: now,
    },

    // legacy mirror
    subscriptionStatus: "canceled",
    subscriptionEnd: now,

    updatedAt: now,
  };

  const v = validateBillingProfile(nextCompany.billing);
  if (!v.ok) {
    return res.status(500).json({
      error: "BillingInvalid",
      message: "Internal billing profile validation failed.",
      errors: v.errors,
    });
  }
  nextCompany.billing = v.normalized;

  await writeTenantEntity(companyId, "company", nextCompany);

  await auditLog({
    companyId,
    actorRole: req.role,
    action: "billing.cancel",
    entityType: "company",
    entityId: companyId,
    meta: {},
    before: { billing: before.billing ?? null, legacy: { subscriptionStatus: before.subscriptionStatus ?? "none", plan: before.plan ?? "free" } },
    after: { billing: nextCompany.billing ?? null, legacy: { subscriptionStatus: nextCompany.subscriptionStatus, plan: nextCompany.plan ?? "" } },
  });

  res.json({
    ok: true,
    companyId,
    billing: nextCompany.billing,
  });
});

export default router;
