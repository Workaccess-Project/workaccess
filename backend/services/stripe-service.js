// backend/services/stripe-service.js
// SAFE Stripe helper used by billing routes.
// - Ensures Stripe customer exists (idempotent)
// - Creates Stripe Checkout sessions
// - Creates Stripe Customer Portal sessions
// - Does NOT create subscriptions directly
// - Does NOT change billingStatus (webhook lifecycle does that)

import Stripe from "stripe";

function safeString(v) {
  return (v ?? "").toString().trim();
}

function stripeClientOrThrow() {
  const key = safeString(process.env.STRIPE_SECRET_KEY);

  if (!key) {
    const err = new Error("Stripe is not configured (missing STRIPE_SECRET_KEY).");
    err.code = "STRIPE_NOT_CONFIGURED";
    throw err;
  }

  return new Stripe(key);
}

function pickCustomerEmail(companyProfile) {
  return (
    safeString(companyProfile?.email) ||
    safeString(companyProfile?.contactEmail) ||
    safeString(companyProfile?.ownerEmail) ||
    ""
  );
}

function pickCustomerName(companyProfile, companyId) {
  return (
    safeString(companyProfile?.name) ||
    safeString(companyProfile?.companyName) ||
    safeString(companyProfile?.title) ||
    `Workaccess ${safeString(companyId)}`.trim()
  );
}

/**
 * ensureStripeCustomer
 */
export async function ensureStripeCustomer({ companyId, companyProfile, billingProfile }) {

  const cid = safeString(companyId);

  if (!cid) {
    const err = new Error("Missing companyId.");
    err.code = "STRIPE_ERROR";
    throw err;
  }

  const existing = safeString(billingProfile?.stripe?.customerId);

  if (existing) {
    return { created: false, customerId: existing };
  }

  const stripe = stripeClientOrThrow();

  const email = pickCustomerEmail(companyProfile);
  const name = pickCustomerName(companyProfile, cid);

  let customer;

  try {

    customer = await stripe.customers.create({
      name: name || undefined,
      email: email || undefined,
      metadata: {
        companyId: cid,
        source: "workaccess",
      },
    });

  } catch (e) {

    const err = new Error(safeString(e?.message) || "Stripe customer create failed.");
    err.code = safeString(e?.code) || "STRIPE_ERROR";
    throw err;

  }

  const customerId = safeString(customer?.id);

  if (!customerId) {

    const err = new Error("Stripe returned empty customer id.");
    err.code = "STRIPE_ERROR";
    throw err;

  }

  return { created: true, customerId };
}

/**
 * createCustomerPortalSession
 *
 * Creates Stripe Billing Portal session.
 * Used for:
 * - change payment method
 * - cancel subscription
 * - download invoices
 */
export async function createCustomerPortalSession({ customerId }) {

  const cid = safeString(customerId);

  if (!cid) {

    const err = new Error("Missing Stripe customerId.");
    err.code = "STRIPE_ERROR";
    throw err;

  }

  const returnUrl = safeString(process.env.STRIPE_PORTAL_RETURN_URL);

  if (!returnUrl) {

    const err = new Error("Missing STRIPE_PORTAL_RETURN_URL.");
    err.code = "STRIPE_ERROR";
    throw err;

  }

  const stripe = stripeClientOrThrow();

  let session;

  try {

    session = await stripe.billingPortal.sessions.create({
      customer: cid,
      return_url: returnUrl,
    });

  } catch (e) {

    const err = new Error(safeString(e?.message) || "Stripe portal session failed.");
    err.code = safeString(e?.code) || "STRIPE_ERROR";
    throw err;

  }

  const url = safeString(session?.url);

  if (!url) {

    const err = new Error("Stripe portal returned empty URL.");
    err.code = "STRIPE_ERROR";
    throw err;

  }

  return {
    url,
  };
}
