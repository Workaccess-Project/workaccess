// backend/routes/billing.js
// Upgraded in BOX #57.5 to use v36 billing model (company.billing.*)
// Legacy trial/subscription fields are kept for backward compatibility.
//
// BOX #78:
// - SAFE endpoint to ensure Stripe customerId exists
// - NO subscription creation
// - NO billingStatus changes
//
// BOX #81:
// - SAFE endpoint to create Stripe Checkout Session (subscription mode)
// - Manager only, tenant-safe
// - Ensures customerId, returns { url, sessionId }
// - Does NOT change billingStatus / subscriptionId (lifecycle mapping stays in webhook)
//
// BOX #82 (debug assist):
// - Adds SAFE server logs for checkout session creation output
//   (companyId, plan, sessionId, url, successUrl, cancelUrl)
// - No secrets logged, no billing changes
//
// BOX #84:
// - SAFE endpoint to create Stripe Customer Portal session
// - Manager only, tenant-safe
// - Ensures customerId, returns { url }
// - Does NOT change billingStatus (webhook lifecycle mapping stays source-of-truth)
//
// BOX #86:
// - Protected tenant-safe Stripe webhook observability endpoint
// - GET /api/billing/stripe/debug/events
// - Manager only
// - Returns only events for tenant from JWT/companyId
// - No global cross-tenant output
//
// BOX #89:
// - Uses shared Stripe price mapping helper
// - Removes local plan -> priceId mapping duplication

import express from "express";
import Stripe from "stripe";
import { requireRole } from "../auth.js";
import { getCompanyProfile } from "../data-company.js";
import { writeTenantEntity } from "../data/tenant-store.js";
import { auditLog } from "../data-audit.js";
import {
  BILLING_PLANS,
  BILLING_STATUS,
  validateBillingProfile,
} from "../src/billing/billingModel.js";
import { priceIdForPlan } from "../src/billing/stripePriceMapping.js";
import {
  ensureStripeCustomer,
  createCustomerPortalSession,
} from "../services/stripe-service.js";
import { getStripeDebugEventsForCompany } from "../services/stripe-debug-buffer.js";

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
  if (
    [
      BILLING_STATUS.PAST_DUE,
      BILLING_STATUS.UNPAID,
      BILLING_STATUS.CANCELLED,
    ].includes(st)
  ) {
    return true;
  }

  // Defensive: trialing but expired -> locked
  const plan = safeString(billing?.plan);
  const te = safeString(billing?.trialEndsAt);
  if (plan === BILLING_PLANS.TRIAL && te && isExpiredIso(te)) return true;

  return false;
}

function stripeClientOrNull() {
  const key = safeString(process.env.STRIPE_SECRET_KEY);
  if (!key) return null;
  // Do not force apiVersion to avoid runtime mismatch
  return new Stripe(key);
}

function publicAppBaseUrl() {
  // Keep this simple and stable for MVP.
  // If you later introduce env like APP_BASE_URL, update here.
  return "https://workaccess.cz";
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
 * GET /api/billing/stripe/debug/events
 * READ: manager only
 *
 * Tenant-safe Stripe webhook observability.
 * Returns only events whose resolved companyId matches req.auth.companyId.
 * Does NOT expose global cross-tenant event buffer.
 */
router.get("/stripe/debug/events", requireRole(["manager"]), async (req, res) => {
  const companyId = req.auth.companyId;
  const events = getStripeDebugEventsForCompany(companyId);

  return res.json({
    ok: true,
    companyId,
    count: events.length,
    events,
  });
});

/**
 * POST /api/billing/stripe/ensure-customer
 * WRITE: manager only
 *
 * SAFE:
 * - Ensures v36 billing.stripe.customerId exists.
 * - Creates Stripe Customer if missing.
 * - Does NOT create subscription.
 * - Does NOT change billingStatus or plan.
 */
router.post("/stripe/ensure-customer", requireRole(["manager"]), async (req, res) => {
  const companyId = req.auth.companyId;
  const before = await getCompanyProfile(companyId);

  const billingBefore = before?.billing ?? null;
  const stripeBefore = billingBefore?.stripe ?? {};
  const existingCustomerId = safeString(stripeBefore?.customerId);

  // Idempotent fast path: already has customerId
  if (existingCustomerId) {
    return res.json({
      ok: true,
      companyId,
      created: false,
      customerId: existingCustomerId,
    });
  }

  let ensured;
  try {
    ensured = await ensureStripeCustomer({
      companyId,
      companyProfile: before,
      billingProfile: billingBefore,
    });
  } catch (e) {
    const msg = safeString(e?.message) || "Stripe customer ensure failed.";
    const code = safeString(e?.code) || "STRIPE_ERROR";
    console.error("[billing.ensure-customer]", code, msg);

    const status = code === "STRIPE_NOT_CONFIGURED" ? 500 : 502;
    return res.status(status).json({
      error: "StripeError",
      code,
      message:
        code === "STRIPE_NOT_CONFIGURED"
          ? "Stripe is not configured on this server."
          : "Stripe operation failed.",
    });
  }

  const now = nowIso();

  const nextCompany = {
    ...before,
    billing: {
      ...(before.billing || {}),
      stripe: {
        ...((before.billing && before.billing.stripe) || {}),
        customerId: ensured.customerId,
      },
      updatedAt: now,
    },
    updatedAt: now,
  };

  const v = validateBillingProfile(nextCompany.billing);
  if (!v.ok) {
    return res.status(500).json({
      error: "BillingInvalid",
      message:
        "Internal billing profile validation failed after stripe customer ensure.",
      errors: v.errors,
    });
  }
  nextCompany.billing = v.normalized;

  await writeTenantEntity(companyId, "company", nextCompany);

  await auditLog({
    companyId,
    actorRole: req.role,
    action: "stripe.customer.ensure",
    entityType: "company",
    entityId: companyId,
    meta: { created: !!ensured?.created },
    before: { billing: before.billing ?? null },
    after: { billing: nextCompany.billing ?? null },
  });

  return res.json({
    ok: true,
    companyId,
    created: true,
    customerId: ensured.customerId,
  });
});

/**
 * POST /api/billing/stripe/create-checkout-session
 * WRITE: manager only
 *
 * SAFE:
 * - Only allows plan: basic | pro
 * - Ensures Stripe customerId exists
 * - Creates Stripe Checkout Session (mode=subscription)
 * - Returns { ok, companyId, plan, url, sessionId }
 * - Does NOT change billingStatus / subscriptionId here (webhook lifecycle mapping does that)
 */
router.post("/stripe/create-checkout-session", requireRole(["manager"]), async (req, res) => {
  const companyId = req.auth.companyId;

  const plan = safeString(req.body?.plan).toLowerCase();
  if (!["basic", "pro"].includes(plan)) {
    return res.status(400).json({
      error: "BadRequest",
      code: "PLAN_INVALID",
      message: "Allowed plans: basic | pro",
    });
  }

  const stripe = stripeClientOrNull();
  if (!stripe) {
    return res.status(500).json({
      error: "StripeError",
      code: "STRIPE_NOT_CONFIGURED",
      message: "Stripe is not configured on this server.",
    });
  }

  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return res.status(500).json({
      error: "StripeError",
      code: "STRIPE_PRICE_NOT_CONFIGURED",
      message: "Stripe price is not configured for this plan.",
    });
  }

  const before = await getCompanyProfile(companyId);
  const billingBefore = before?.billing ?? null;
  const existingCustomerId = safeString(billingBefore?.stripe?.customerId);

  let customerId = existingCustomerId;

  // Ensure customerId
  if (!customerId) {
    try {
      const ensured = await ensureStripeCustomer({
        companyId,
        companyProfile: before,
        billingProfile: billingBefore,
      });
      customerId = safeString(ensured?.customerId);
    } catch (e) {
      const msg = safeString(e?.message) || "Stripe customer ensure failed.";
      const code = safeString(e?.code) || "STRIPE_ERROR";
      console.error("[billing.create-checkout-session]", code, msg);

      const status = code === "STRIPE_NOT_CONFIGURED" ? 500 : 502;
      return res.status(status).json({
        error: "StripeError",
        code,
        message:
          code === "STRIPE_NOT_CONFIGURED"
            ? "Stripe is not configured on this server."
            : "Stripe operation failed.",
      });
    }

    // Persist ensured customerId (safe write, no billingStatus changes)
    if (customerId) {
      const now = nowIso();
      const nextCompany = {
        ...before,
        billing: {
          ...(before.billing || {}),
          stripe: {
            ...((before.billing && before.billing.stripe) || {}),
            customerId,
          },
          updatedAt: now,
        },
        updatedAt: now,
      };

      const v = validateBillingProfile(nextCompany.billing);
      if (v.ok) {
        nextCompany.billing = v.normalized;
        await writeTenantEntity(companyId, "company", nextCompany);

        await auditLog({
          companyId,
          actorRole: req.role,
          action: "stripe.customer.ensure",
          entityType: "company",
          entityId: companyId,
          meta: { created: true, note: "ensured by checkout create" },
          before: { billing: before.billing ?? null },
          after: { billing: nextCompany.billing ?? null },
        });
      }
    }
  }

  if (!customerId) {
    return res.status(502).json({
      error: "StripeError",
      code: "STRIPE_CUSTOMER_MISSING",
      message: "Failed to ensure Stripe customerId.",
    });
  }

  const base = publicAppBaseUrl();
  const successUrl = `${base}/billing?checkout=success`;
  const cancelUrl = `${base}/billing?checkout=cancel`;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Put companyId into metadata for future linkage (not tenant source of truth)
      metadata: {
        companyId,
        plan,
      },
    });
  } catch (e) {
    const msg =
      safeString(e?.message) || "Stripe checkout session create failed.";
    console.error("[billing.create-checkout-session] STRIPE_ERROR", msg);
    console.error("[stripe.checkout.create.fail]", {
      companyId,
      plan,
      priceId,
      customerId,
      successUrl,
      cancelUrl,
      message: msg,
    });
    return res.status(502).json({
      error: "StripeError",
      code: "STRIPE_CHECKOUT_CREATE_FAILED",
      message: "Stripe operation failed.",
    });
  }

  const sessionId = safeString(session?.id);
  const url = safeString(session?.url);

  // BOX #82: SAFE runtime trace (no secrets)
  console.log("[stripe.checkout.create.ok]", {
    companyId,
    plan,
    customerId,
    priceId,
    sessionId,
    url,
    successUrl,
    cancelUrl,
  });

  try {
    await auditLog({
      companyId,
      actorRole: req.role,
      action: "stripe.checkout.create",
      entityType: "stripe",
      entityId: sessionId || null,
      meta: {
        plan,
        customerId,
        priceId,
      },
      before: { billing: before?.billing ?? null },
      after: { billing: before?.billing ?? null },
    });
  } catch (e) {
    console.error(
      "[billing.create-checkout-session] AUDIT_WRITE_FAILED",
      safeString(e?.message)
    );
    // Do not fail response
  }

  return res.json({
    ok: true,
    companyId,
    plan,
    url,
    sessionId,
  });
});

/**
 * POST /api/billing/stripe/customer-portal
 * WRITE: manager only
 *
 * SAFE:
 * - Ensures Stripe customerId exists
 * - Creates Stripe Customer Portal session
 * - Returns { ok, companyId, url }
 * - Does NOT change billingStatus / plan (webhook lifecycle mapping stays source-of-truth)
 *
 * Requires env:
 *  - STRIPE_SECRET_KEY
 *  - STRIPE_PORTAL_RETURN_URL
 */
router.post("/stripe/customer-portal", requireRole(["manager"]), async (req, res) => {
  const companyId = req.auth.companyId;

  const before = await getCompanyProfile(companyId);
  const billingBefore = before?.billing ?? null;

  let customerId = safeString(billingBefore?.stripe?.customerId);

  // Ensure customerId (same safe pattern as checkout)
  if (!customerId) {
    try {
      const ensured = await ensureStripeCustomer({
        companyId,
        companyProfile: before,
        billingProfile: billingBefore,
      });
      customerId = safeString(ensured?.customerId);
    } catch (e) {
      const msg = safeString(e?.message) || "Stripe customer ensure failed.";
      const code = safeString(e?.code) || "STRIPE_ERROR";
      console.error("[billing.customer-portal]", code, msg);

      const status = code === "STRIPE_NOT_CONFIGURED" ? 500 : 502;
      return res.status(status).json({
        error: "StripeError",
        code,
        message:
          code === "STRIPE_NOT_CONFIGURED"
            ? "Stripe is not configured on this server."
            : "Stripe operation failed.",
      });
    }

    // Persist ensured customerId (safe write, no billingStatus changes)
    if (customerId) {
      const now = nowIso();
      const nextCompany = {
        ...before,
        billing: {
          ...(before.billing || {}),
          stripe: {
            ...((before.billing && before.billing.stripe) || {}),
            customerId,
          },
          updatedAt: now,
        },
        updatedAt: now,
      };

      const v = validateBillingProfile(nextCompany.billing);
      if (v.ok) {
        nextCompany.billing = v.normalized;
        await writeTenantEntity(companyId, "company", nextCompany);

        try {
          await auditLog({
            companyId,
            actorRole: req.role,
            action: "stripe.customer.ensure",
            entityType: "company",
            entityId: companyId,
            meta: { created: true, note: "ensured by customer portal" },
            before: { billing: before.billing ?? null },
            after: { billing: nextCompany.billing ?? null },
          });
        } catch (e) {
          console.error(
            "[billing.customer-portal] AUDIT_WRITE_FAILED",
            safeString(e?.message)
          );
          // Do not fail
        }
      }
    }
  }

  if (!customerId) {
    return res.status(502).json({
      error: "StripeError",
      code: "STRIPE_CUSTOMER_MISSING",
      message: "Failed to ensure Stripe customerId.",
    });
  }

  let portal;
  try {
    portal = await createCustomerPortalSession({ customerId });
  } catch (e) {
    const msg = safeString(e?.message) || "Stripe portal session failed.";
    const code = safeString(e?.code) || "STRIPE_ERROR";
    console.error("[billing.customer-portal]", code, msg);

    const status = code === "STRIPE_NOT_CONFIGURED" ? 500 : 502;
    return res.status(status).json({
      error: "StripeError",
      code,
      message:
        code === "STRIPE_NOT_CONFIGURED"
          ? "Stripe is not configured on this server."
          : "Stripe operation failed.",
    });
  }

  const url = safeString(portal?.url);
  if (!url) {
    return res.status(502).json({
      error: "StripeError",
      code: "STRIPE_PORTAL_URL_EMPTY",
      message: "Stripe portal returned empty URL.",
    });
  }

  // SAFE runtime trace (no secrets)
  console.log("[stripe.portal.create.ok]", {
    companyId,
    customerId,
  });

  try {
    await auditLog({
      companyId,
      actorRole: req.role,
      action: "stripe.portal.create",
      entityType: "stripe",
      entityId: null,
      meta: {
        customerId,
      },
      before: { billing: before?.billing ?? null },
      after: { billing: before?.billing ?? null },
    });
  } catch (e) {
    console.error(
      "[billing.customer-portal] AUDIT_WRITE_FAILED",
      safeString(e?.message)
    );
    // Do not fail response
  }

  return res.json({
    ok: true,
    companyId,
    url,
  });
});

export default router;
