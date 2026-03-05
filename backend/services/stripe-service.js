// backend/services/stripe-service.js
// SAFE Stripe helper used by billing routes.
// - Ensures Stripe customer exists (idempotent)
// - Does NOT create subscriptions
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
  // Do not force apiVersion to avoid runtime mismatch
  return new Stripe(key);
}

// Tries to pick a reasonable email/name if present in your company profile.
// We keep it defensive because company profile shape may evolve.
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
 * ensureStripeCustomer({ companyId, companyProfile, billingProfile })
 *
 * Returns:
 *  { created: false, customerId } if already present in billingProfile
 *  { created: true,  customerId } if created in Stripe
 *
 * Throws error with code:
 *  - STRIPE_NOT_CONFIGURED
 *  - STRIPE_ERROR (generic)
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
