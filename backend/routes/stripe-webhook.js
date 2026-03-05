// backend/routes/stripe-webhook.js
//
// BOX #85 – Stripe Webhook Hardening
// - Verifies Stripe signature (requires raw body)
// - Ignores irrelevant Stripe events (prevents log spam)
// - For relevant events: resolves tenant by metadata.companyId or by customerId lookup
// - Never fails webhook delivery because tenant is missing (returns 200 to prevent retries)
// - Writes tenant-scoped audit when companyId is resolved

import express from "express";
import Stripe from "stripe";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

import { auditLog } from "../data-audit.js";

const router = express.Router();

function safeString(v) {
  return (v ?? "").toString().trim();
}

function looksLikeCompanyId(v) {
  const s = safeString(v);
  if (s.length < 2 || s.length > 64) return false;
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

function stripeClientOrNull() {
  const key = safeString(process.env.STRIPE_SECRET_KEY);
  if (!key) return null;
  return new Stripe(key); // keep default apiVersion
}

const RELEVANT_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "invoice.payment_failed",
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
  return "";
}

function extractObjectId(obj) {
  return safeString(obj?.id);
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

  // ✅ Ignore irrelevant events silently (prevents log spam)
  if (!isRelevant) {
    return res.json({ received: true, ignored: true });
  }

  // Try resolve companyId by customerId when missing
  if (!companyId && customerId) {
    companyId = await findCompanyIdByStripeCustomerId(customerId);
  }

  if (!companyId) {
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

  // Minimal ops log for relevant events (now tenant-resolved)
  console.log(
    `[stripe-webhook] received event=${eventId} type=${type} companyId=${companyId} customer=${customerId || "n/a"} subscription=${subscriptionId || "n/a"}`
  );

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
