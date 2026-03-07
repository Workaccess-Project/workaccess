// backend/src/billing/stripePriceMapping.js
//
// BOX #89 – Stripe Price Mapping Hardening
//
// Single source of truth for:
//   plan -> Stripe priceId
//   Stripe priceId -> plan
//
// Prevents mapping drift between:
//   routes/billing.js
//   routes/stripe-webhook.js
//
// Enterprise support is prepared but optional (env based).

import { BILLING_PLANS } from "./billingModel.js";

function safeString(v) {
  return (v ?? "").toString().trim();
}

function normalizePlan(planRaw) {
  const p = safeString(planRaw).toLowerCase();

  if (p === BILLING_PLANS.TRIAL) return BILLING_PLANS.TRIAL;
  if (p === BILLING_PLANS.BASIC) return BILLING_PLANS.BASIC;
  if (p === BILLING_PLANS.PRO) return BILLING_PLANS.PRO;
  if (p === BILLING_PLANS.ENTERPRISE) return BILLING_PLANS.ENTERPRISE;

  // legacy compatibility
  if (p === "free") return BILLING_PLANS.TRIAL;
  if (p === "basic") return BILLING_PLANS.BASIC;
  if (p === "pro") return BILLING_PLANS.PRO;

  return "";
}

export function priceIdForPlan(planRaw) {
  const plan = normalizePlan(planRaw);

  if (plan === BILLING_PLANS.BASIC) {
    return safeString(process.env.STRIPE_PRICE_BASIC);
  }

  if (plan === BILLING_PLANS.PRO) {
    return safeString(process.env.STRIPE_PRICE_PRO);
  }

  if (plan === BILLING_PLANS.ENTERPRISE) {
    return safeString(process.env.STRIPE_PRICE_ENTERPRISE);
  }

  return "";
}

export function planFromPriceId(priceIdRaw, fallback = "") {
  const pid = safeString(priceIdRaw);

  if (!pid) return safeString(fallback);

  const basic = safeString(process.env.STRIPE_PRICE_BASIC);
  const pro = safeString(process.env.STRIPE_PRICE_PRO);
  const enterprise = safeString(process.env.STRIPE_PRICE_ENTERPRISE);

  if (basic && pid === basic) return BILLING_PLANS.BASIC;
  if (pro && pid === pro) return BILLING_PLANS.PRO;
  if (enterprise && pid === enterprise) return BILLING_PLANS.ENTERPRISE;

  return safeString(fallback);
}
