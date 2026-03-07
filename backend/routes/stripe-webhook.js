// backend/routes/stripe-webhook.js
//
// BOX #85 - Stripe Webhook Hardening
// - Verifies Stripe signature (requires raw body)
// - Ignores irrelevant Stripe events (prevents log spam)
// - For relevant events: resolves tenant by metadata.companyId or by customerId lookup
// - Never fails webhook delivery because tenant is missing (returns 200 to prevent retries)
// - Writes tenant-scoped audit when companyId is resolved
//
// BOX #86:
// - Writes best-effort observability records to shared in-memory buffer
// - Does NOT expose any public debug endpoint here
// - Read access is provided only from protected tenant-safe billing API
//
// BOX #87:
// - Adds Stripe billing lifecycle synchronization
// - Sync source-of-truth into company.billing.*
// - Keeps legacy subscription fields in sync for compatibility
// - Never fails webhook delivery because billing sync write fails
//
// BOX #89:
// - Uses shared Stripe price mapping helper
// - Removes local priceId -> plan mapping duplication
// - Keeps webhook plan resolution aligned with checkout mapping

import express from "express";
import Stripe from "stripe";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

import { getCompanyProfile } from "../data-company.js";
import { writeTenantEntity } from "../data/tenant-store.js";
import { auditLog } from "../data-audit.js";
import { pushStripeDebugEvent } from "../services/stripe-debug-buffer.js";
import {
  BILLING_PLANS,
  BILLING_STATUS,
  validateBillingProfile,
} from "../src/billing/billingModel.js";
import { planFromPriceId } from "../src/billing/stripePriceMapping.js";

const router = express.Router();

function safeString(v) {
  return (v ?? "").toString().trim();
}

function looksLikeCompanyId(v) {
  const s = safeString(v);
  if (s.length < 2 || s.length > 64) return false;
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

function nowIso() {
  return new Date().toISOString();
}

function stripeClientOrNull() {
  const key = safeString(process.env.STRIPE_SECRET_KEY);
  if (!key) return null;
  return new Stripe(key); // keep default apiVersion
}

const RELEVANT_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

// Rate-limit noisy logs (in-memory, best-effort)
const noisyLogCache = new Map(); // key -> lastTs
const NOISY_LOG_TTL_MS = 10 * 60 * 1000; // 10 minutes

function shouldLogNoisyOnce(key) {
  const now = Date.now();
  const prev = noisyLogCache.get(key);
  if (prev && now - prev < NOISY_LOG_TTL_MS) return false;
  noisyLogCache.set(key, now);
  return true;
}

function toIsoFromUnixSeconds(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n * 1000).toISOString();
}

function parseIsoOrEmpty(v) {
  const s = safeString(v);
  if (!s) return "";
  const d = new Date(s);
  if (String(d) === "Invalid Date") return "";
  return d.toISOString();
}

function findPriceIdInStripeObject(obj) {
  const direct = safeString(obj?.items?.data?.[0]?.price?.id);
  if (direct) return direct;

  const invoiceLine = safeString(obj?.lines?.data?.[0]?.price?.id);
  if (invoiceLine) return invoiceLine;

  return "";
}

function normalizePlanFromRaw(planRaw, fallback = "") {
  const p = safeString(planRaw).toLowerCase();

  if (p === BILLING_PLANS.TRIAL) return BILLING_PLANS.TRIAL;
  if (p === BILLING_PLANS.BASIC) return BILLING_PLANS.BASIC;
  if (p === BILLING_PLANS.PRO) return BILLING_PLANS.PRO;
  if (p === BILLING_PLANS.ENTERPRISE) return BILLING_PLANS.ENTERPRISE;

  // legacy compatibility
  if (p === "free") return BILLING_PLANS.TRIAL;
  if (p === "basic") return BILLING_PLANS.BASIC;
  if (p === "pro") return BILLING_PLANS.PRO;

  return safeString(fallback);
}

function mapStripeSubscriptionStatusToBillingStatus(stripeStatus, fallback = "") {
  const s = safeString(stripeStatus).toLowerCase();

  if (s === "trialing") return BILLING_STATUS.TRIALING;
  if (s === "active") return BILLING_STATUS.ACTIVE;
  if (s === "past_due") return BILLING_STATUS.PAST_DUE;
  if (s === "unpaid") return BILLING_STATUS.UNPAID;
  if (s === "canceled") return BILLING_STATUS.CANCELLED;
  if (s === "cancelled") return BILLING_STATUS.CANCELLED;
  if (s === "incomplete_expired") return BILLING_STATUS.UNPAID;

  return safeString(fallback);
}

function mapBillingStatusToLegacySubscriptionStatus(billingStatus, fallback = "none") {
  const st = safeString(billingStatus);

  if (st === BILLING_STATUS.ACTIVE) return "active";
  if (st === BILLING_STATUS.TRIALING) return "active";
  if (st === BILLING_STATUS.PAST_DUE) return "past_due";
  if (st === BILLING_STATUS.UNPAID) return "past_due";
  if (st === BILLING_STATUS.CANCELLED) return "canceled";

  return safeString(fallback) || "none";
}

function mapBillingPlanToLegacyPlan(plan, fallback = "free") {
  const p = safeString(plan);

  if (p === BILLING_PLANS.TRIAL) return "free";
  if (p === BILLING_PLANS.BASIC) return "basic";
  if (p === BILLING_PLANS.PRO) return "pro";

  return safeString(fallback) || "free";
}

async function findCompanyIdByStripeCustomerId(customerId) {
  const cid = safeString(customerId);
  if (!cid) return "";

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const backendDir = path.resolve(__dirname, "..");
  const tenantsDir = path.resolve(backendDir, "data", "tenants");

  let entries;
  try {
    entries = await fs.readdir(tenantsDir, { withFileTypes: true });
  } catch {
    return "";
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const companyId = e.name;

    const companyJsonPath = path.join(tenantsDir, companyId, "company.json");
    let raw;
    try {
      raw = await fs.readFile(companyJsonPath, "utf8");
    } catch {
      continue;
    }

    let company;
    try {
      company = JSON.parse(raw);
    } catch {
      continue;
    }

    const stored =
      company?.billing?.stripe?.customerId ??
      company?.stripe?.customerId ??
      null;

    if (safeString(stored) === cid) return companyId;
  }

  return "";
}

function extractStripeObject(event) {
  return event?.data?.object ?? null;
}

function extractCustomerId(obj) {
  const c = obj?.customer;
  if (typeof c === "string") return safeString(c);
  return "";
}

function extractSubscriptionId(obj) {
  const s = obj?.subscription;
  if (typeof s === "string") return safeString(s);

  const id = safeString(obj?.id);
  if (safeString(obj?.object) === "subscription" && id) return id;

  return "";
}

function extractObjectId(obj) {
  return safeString(obj?.id);
}

function buildLifecyclePatch({ type, obj, profile }) {
  const prevBilling = profile?.billing ?? {};
  const prevStripe = prevBilling?.stripe ?? {};

  const customerId =
    extractCustomerId(obj) ||
    safeString(prevStripe?.customerId);

  const subscriptionId =
    extractSubscriptionId(obj) ||
    safeString(prevStripe?.subscriptionId);

  const priceId =
    findPriceIdInStripeObject(obj) ||
    safeString(prevStripe?.priceId);

  const metadataPlan = normalizePlanFromRaw(obj?.metadata?.plan);
  const planFromPrice = planFromPriceId(priceId);
  const prevPlan = normalizePlanFromRaw(prevBilling?.plan, BILLING_PLANS.TRIAL);

  let nextPlan = metadataPlan || planFromPrice || prevPlan || BILLING_PLANS.TRIAL;
  let nextStatus = safeString(prevBilling?.billingStatus) || BILLING_STATUS.TRIALING;
  let nextTrialEndsAt = parseIsoOrEmpty(prevBilling?.trialEndsAt);

  let subscriptionStart =
    parseIsoOrEmpty(profile?.subscriptionStart) ||
    toIsoFromUnixSeconds(obj?.start_date) ||
    toIsoFromUnixSeconds(obj?.current_period_start);

  let subscriptionEnd =
    parseIsoOrEmpty(profile?.subscriptionEnd) ||
    toIsoFromUnixSeconds(obj?.current_period_end);

  if (type === "checkout.session.completed") {
    if (!safeString(subscriptionStart)) {
      subscriptionStart = nowIso();
    }

    if (metadataPlan) {
      nextPlan = metadataPlan;
    }

    return {
      billing: {
        plan: nextPlan || prevPlan || BILLING_PLANS.TRIAL,
        billingStatus: nextStatus,
        trialEndsAt: nextPlan === BILLING_PLANS.TRIAL ? nextTrialEndsAt : null,
        stripe: {
          customerId: customerId || null,
          subscriptionId: subscriptionId || null,
          priceId: priceId || null,
        },
      },
      legacy: {
        subscriptionStatus: safeString(profile?.subscriptionStatus) || "none",
        plan: safeString(profile?.plan) || "free",
        paymentProvider:
          customerId || subscriptionId
            ? "stripe"
            : safeString(profile?.paymentProvider),
        subscriptionStart: subscriptionStart || "",
        subscriptionEnd: subscriptionEnd || "",
      },
      meta: {
        resolvedPlan: nextPlan || null,
        resolvedBillingStatus: nextStatus || null,
        customerId: customerId || null,
        subscriptionId: subscriptionId || null,
        priceId: priceId || null,
      },
    };
  }

  if (type === "invoice.payment_succeeded") {
    nextStatus = BILLING_STATUS.ACTIVE;
    if (planFromPrice) nextPlan = planFromPrice;

    return {
      billing: {
        plan: nextPlan || prevPlan || BILLING_PLANS.BASIC,
        billingStatus: nextStatus,
        trialEndsAt: nextPlan === BILLING_PLANS.TRIAL ? nextTrialEndsAt : null,
        stripe: {
          customerId: customerId || null,
          subscriptionId: subscriptionId || null,
          priceId: priceId || null,
        },
      },
      legacy: {
        subscriptionStatus: "active",
        plan: mapBillingPlanToLegacyPlan(nextPlan, profile?.plan),
        paymentProvider: "stripe",
        subscriptionStart: subscriptionStart || parseIsoOrEmpty(profile?.subscriptionStart) || "",
        subscriptionEnd: subscriptionEnd || parseIsoOrEmpty(profile?.subscriptionEnd) || "",
      },
      meta: {
        resolvedPlan: nextPlan || null,
        resolvedBillingStatus: nextStatus,
        customerId: customerId || null,
        subscriptionId: subscriptionId || null,
        priceId: priceId || null,
      },
    };
  }

  if (type === "invoice.payment_failed") {
    nextStatus = BILLING_STATUS.PAST_DUE;
    if (planFromPrice) nextPlan = planFromPrice;

    return {
      billing: {
        plan: nextPlan || prevPlan || BILLING_PLANS.BASIC,
        billingStatus: nextStatus,
        trialEndsAt: nextPlan === BILLING_PLANS.TRIAL ? nextTrialEndsAt : null,
        stripe: {
          customerId: customerId || null,
          subscriptionId: subscriptionId || null,
          priceId: priceId || null,
        },
      },
      legacy: {
        subscriptionStatus: "past_due",
        plan: mapBillingPlanToLegacyPlan(nextPlan, profile?.plan),
        paymentProvider: "stripe",
        subscriptionStart: subscriptionStart || parseIsoOrEmpty(profile?.subscriptionStart) || "",
        subscriptionEnd: subscriptionEnd || parseIsoOrEmpty(profile?.subscriptionEnd) || "",
      },
      meta: {
        resolvedPlan: nextPlan || null,
        resolvedBillingStatus: nextStatus,
        customerId: customerId || null,
        subscriptionId: subscriptionId || null,
        priceId: priceId || null,
      },
    };
  }

  if (type === "customer.subscription.updated") {
    const stripeStatus = safeString(obj?.status);
    nextStatus = mapStripeSubscriptionStatusToBillingStatus(
      stripeStatus,
      nextStatus || BILLING_STATUS.TRIALING
    );

    if (planFromPrice) nextPlan = planFromPrice;
    if (metadataPlan) nextPlan = metadataPlan;

    const trialEnd = toIsoFromUnixSeconds(obj?.trial_end);
    if (nextPlan === BILLING_PLANS.TRIAL) {
      nextTrialEndsAt = trialEnd || nextTrialEndsAt;
    } else {
      nextTrialEndsAt = null;
    }

    subscriptionStart =
      toIsoFromUnixSeconds(obj?.start_date) ||
      toIsoFromUnixSeconds(obj?.current_period_start) ||
      subscriptionStart;

    subscriptionEnd =
      toIsoFromUnixSeconds(obj?.current_period_end) ||
      subscriptionEnd;

    return {
      billing: {
        plan: nextPlan || prevPlan || BILLING_PLANS.BASIC,
        billingStatus: nextStatus,
        trialEndsAt: nextPlan === BILLING_PLANS.TRIAL ? nextTrialEndsAt : null,
        stripe: {
          customerId: customerId || null,
          subscriptionId: subscriptionId || null,
          priceId: priceId || null,
        },
      },
      legacy: {
        subscriptionStatus: mapBillingStatusToLegacySubscriptionStatus(
          nextStatus,
          profile?.subscriptionStatus
        ),
        plan: mapBillingPlanToLegacyPlan(nextPlan, profile?.plan),
        paymentProvider: "stripe",
        subscriptionStart: subscriptionStart || "",
        subscriptionEnd: subscriptionEnd || "",
      },
      meta: {
        stripeStatus: stripeStatus || null,
        resolvedPlan: nextPlan || null,
        resolvedBillingStatus: nextStatus || null,
        customerId: customerId || null,
        subscriptionId: subscriptionId || null,
        priceId: priceId || null,
      },
    };
  }

  if (type === "customer.subscription.deleted") {
    const endedAt =
      toIsoFromUnixSeconds(obj?.ended_at) ||
      toIsoFromUnixSeconds(obj?.canceled_at) ||
      toIsoFromUnixSeconds(obj?.current_period_end) ||
      nowIso();

    if (planFromPrice) nextPlan = planFromPrice;

    return {
      billing: {
        plan: nextPlan || prevPlan || BILLING_PLANS.BASIC,
        billingStatus: BILLING_STATUS.CANCELLED,
        trialEndsAt: nextPlan === BILLING_PLANS.TRIAL ? nextTrialEndsAt : null,
        stripe: {
          customerId: customerId || null,
          subscriptionId: subscriptionId || null,
          priceId: priceId || null,
        },
      },
      legacy: {
        subscriptionStatus: "canceled",
        plan: mapBillingPlanToLegacyPlan(nextPlan, profile?.plan),
        paymentProvider: "stripe",
        subscriptionStart:
          subscriptionStart || parseIsoOrEmpty(profile?.subscriptionStart) || "",
        subscriptionEnd: endedAt,
      },
      meta: {
        resolvedPlan: nextPlan || null,
        resolvedBillingStatus: BILLING_STATUS.CANCELLED,
        customerId: customerId || null,
        subscriptionId: subscriptionId || null,
        priceId: priceId || null,
      },
    };
  }

  return null;
}

async function syncCompanyBillingFromStripeEvent({ companyId, type, obj, eventId }) {
  const profile = await getCompanyProfile(companyId);
  const patch = buildLifecyclePatch({ type, obj, profile });

  if (!patch) {
    return { ok: true, changed: false, reason: "no_lifecycle_patch" };
  }

  const now = nowIso();

  const nextCompany = {
    ...profile,
    billing: {
      ...(profile.billing || {}),
      ...(patch.billing || {}),
      stripe: {
        ...((profile.billing && profile.billing.stripe) || {}),
        ...((patch.billing && patch.billing.stripe) || {}),
      },
      updatedAt: now,
    },
    subscriptionStatus: safeString(patch.legacy?.subscriptionStatus ?? profile.subscriptionStatus),
    plan: safeString(patch.legacy?.plan ?? profile.plan),
    paymentProvider: safeString(patch.legacy?.paymentProvider ?? profile.paymentProvider),
    subscriptionStart: parseIsoOrEmpty(patch.legacy?.subscriptionStart ?? profile.subscriptionStart),
    subscriptionEnd: parseIsoOrEmpty(patch.legacy?.subscriptionEnd ?? profile.subscriptionEnd),
    updatedAt: now,
  };

  const validation = validateBillingProfile(nextCompany.billing);
  if (!validation.ok) {
    const err = new Error("Billing profile validation failed after Stripe lifecycle sync.");
    err.code = "BILLING_INVALID";
    err.details = validation.errors;
    throw err;
  }
  nextCompany.billing = validation.normalized;

  const beforeSnapshot = {
    billing: profile?.billing ?? null,
    subscriptionStatus: profile?.subscriptionStatus ?? null,
    plan: profile?.plan ?? null,
    paymentProvider: profile?.paymentProvider ?? null,
    subscriptionStart: profile?.subscriptionStart ?? null,
    subscriptionEnd: profile?.subscriptionEnd ?? null,
  };

  const afterSnapshot = {
    billing: nextCompany?.billing ?? null,
    subscriptionStatus: nextCompany?.subscriptionStatus ?? null,
    plan: nextCompany?.plan ?? null,
    paymentProvider: nextCompany?.paymentProvider ?? null,
    subscriptionStart: nextCompany?.subscriptionStart ?? null,
    subscriptionEnd: nextCompany?.subscriptionEnd ?? null,
  };

  const changed = JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot);

  if (!changed) {
    return { ok: true, changed: false, reason: "no_state_change", meta: patch.meta };
  }

  await writeTenantEntity(companyId, "company", nextCompany);

  try {
    await auditLog({
      companyId,
      actorRole: "system",
      action: "stripe.billing.lifecycle_sync",
      entityType: "company",
      entityId: companyId,
      meta: {
        eventId: eventId || null,
        type,
        ...(patch.meta || {}),
      },
      before: beforeSnapshot,
      after: afterSnapshot,
    });
  } catch (e) {
    console.error(
      "[stripe-webhook] BILLING_AUDIT_WRITE_FAILED",
      safeString(e?.message)
    );
  }

  return { ok: true, changed: true, meta: patch.meta };
}

// Public readiness endpoint (NO secrets, only booleans)
router.get("/ready", (req, res) => {
  const hasSecretKey = !!safeString(process.env.STRIPE_SECRET_KEY);
  const hasWebhookSecret = !!safeString(process.env.STRIPE_WEBHOOK_SECRET);
  const hasPriceBasic = !!safeString(process.env.STRIPE_PRICE_BASIC);
  const hasPricePro = !!safeString(process.env.STRIPE_PRICE_PRO);

  res.json({
    ok: true,
    stripe: {
      secretKey: hasSecretKey,
      webhookSecret: hasWebhookSecret,
      priceBasic: hasPriceBasic,
      pricePro: hasPricePro,
    },
  });
});

// POST /api/stripe/webhook
router.post("/webhook", async (req, res) => {
  const stripe = stripeClientOrNull();
  const webhookSecret = safeString(process.env.STRIPE_WEBHOOK_SECRET);

  if (!stripe || !webhookSecret) {
    console.error("[stripe-webhook] ENV_NOT_CONFIGURED");
    return res.status(500).json({
      error: "StripeNotConfigured",
      message: "Stripe webhook is not configured on this server.",
    });
  }

  const sig = safeString(req.headers["stripe-signature"]);
  if (!sig) {
    console.warn("[stripe-webhook] MISSING_SIGNATURE");
    return res.status(400).json({
      error: "BadRequest",
      code: "STRIPE_SIGNATURE_MISSING",
      message: "Missing Stripe signature header.",
    });
  }

  let event;
  try {
    // req.body is a Buffer because we mount this router with express.raw()
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (e) {
    console.warn("[stripe-webhook] SIGNATURE_INVALID", safeString(e?.message));
    return res.status(400).json({
      error: "BadRequest",
      code: "STRIPE_SIGNATURE_INVALID",
      message: "Invalid Stripe webhook signature.",
    });
  }

  const type = safeString(event?.type);
  const eventId = safeString(event?.id);

  const obj = extractStripeObject(event);
  const stripeObject = safeString(obj?.object);
  const customerId = extractCustomerId(obj);
  const subscriptionId = extractSubscriptionId(obj);
  const objectId = extractObjectId(obj);

  const meta = obj?.metadata ?? {};
  let companyId = looksLikeCompanyId(meta?.companyId)
    ? safeString(meta.companyId)
    : "";

  const isRelevant = RELEVANT_EVENT_TYPES.has(type);

  // Ignore irrelevant events silently (prevents log spam)
  if (!isRelevant) {
    pushStripeDebugEvent({
      eventId,
      type,
      relevant: false,
      ignored: true,
      reason: "irrelevant_event_type",
      companyId: companyId || null,
      customerId: customerId || null,
      subscriptionId: subscriptionId || null,
      stripeObject: stripeObject || null,
      objectId: objectId || null,
    });

    return res.json({ received: true, ignored: true });
  }

  // Try resolve companyId by customerId when missing
  if (!companyId && customerId) {
    companyId = await findCompanyIdByStripeCustomerId(customerId);
  }

  if (!companyId) {
    pushStripeDebugEvent({
      eventId,
      type,
      relevant: true,
      ignored: true,
      reason: customerId
        ? "tenant_not_found_for_customer"
        : "missing_customer_id",
      companyId: null,
      customerId: customerId || null,
      subscriptionId: subscriptionId || null,
      stripeObject: stripeObject || null,
      objectId: objectId || null,
    });

    // Relevant event, but tenant not found. Do NOT fail webhook delivery.
    const key = `TENANT_NOT_FOUND:${type}:${customerId || "no_customer"}`;
    if (shouldLogNoisyOnce(key)) {
      if (!customerId) {
        console.warn(
          `[stripe-webhook] NO_CUSTOMER_ID event=${eventId} type=${type}`
        );
      } else {
        console.warn(
          `[stripe-webhook] TENANT_NOT_FOUND_FOR_CUSTOMER customer=${customerId} event=${eventId} type=${type}`
        );
      }
    }
    return res.json({ received: true, ignored: true });
  }

  pushStripeDebugEvent({
    eventId,
    type,
    relevant: true,
    ignored: false,
    reason: "processed",
    companyId,
    customerId: customerId || null,
    subscriptionId: subscriptionId || null,
    stripeObject: stripeObject || null,
    objectId: objectId || null,
  });

  // Minimal ops log for relevant events (now tenant-resolved)
  console.log(
    `[stripe-webhook] received event=${eventId} type=${type} companyId=${companyId} customer=${customerId || "n/a"} subscription=${subscriptionId || "n/a"}`
  );

  // BOX #87: lifecycle sync (best-effort; never fail webhook)
  try {
    const sync = await syncCompanyBillingFromStripeEvent({
      companyId,
      type,
      obj,
      eventId,
    });

    if (sync?.changed) {
      console.log(
        `[stripe-webhook] billing-sync event=${eventId} type=${type} companyId=${companyId} status=${safeString(sync?.meta?.resolvedBillingStatus) || "n/a"} plan=${safeString(sync?.meta?.resolvedPlan) || "n/a"}`
      );
    }
  } catch (e) {
    console.error(
      "[stripe-webhook] BILLING_SYNC_FAILED",
      safeString(e?.message),
      Array.isArray(e?.details) ? e.details.join(" | ") : ""
    );
  }

  // Tenant audit (best-effort; never fail webhook)
  try {
    await auditLog({
      companyId,
      actorRole: "system",
      action: "stripe.webhook.received",
      entityType: "stripe",
      entityId: eventId || null,
      meta: {
        type,
        stripeObject,
        objectId: objectId || null,
        customer: customerId || null,
        subscription: subscriptionId || null,
      },
      before: null,
      after: null,
    });
  } catch (e) {
    console.error("[stripe-webhook] AUDIT_WRITE_FAILED", safeString(e?.message));
  }

  return res.json({ received: true });
});

export default router;
