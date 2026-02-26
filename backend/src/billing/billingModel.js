'use strict';

/**
 * Billing Architecture Foundation (BOX #57.1)
 * - Pure model + validation helpers
 * - No side effects
 * - ESM module (backend has "type":"module")
 */

export const BILLING_PLANS = Object.freeze({
  TRIAL: 'trial',
  BASIC: 'basic',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
});

export const BILLING_STATUS = Object.freeze({
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  UNPAID: 'unpaid',
  CANCELLED: 'cancelled',
});

/**
 * Creates a safe default billing profile for a new tenant.
 * @param {object} opts
 * @param {number} [opts.trialDays=14]
 * @param {Date}   [opts.now=new Date()]
 */
export function createDefaultBillingProfile(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const trialDays = Number.isFinite(opts.trialDays) ? opts.trialDays : 14;

  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  return {
    plan: BILLING_PLANS.TRIAL,
    billingStatus: BILLING_STATUS.TRIALING,
    trialEndsAt: trialEndsAt.toISOString(),

    // Reserved for Stripe later (kept nullable/optional)
    stripe: {
      customerId: null,
      subscriptionId: null,
      priceId: null,
    },

    // Audit metadata (optional)
    updatedAt: now.toISOString(),
  };
}

/**
 * Normalizes a profile (does not mutate input).
 * - Ensures required keys exist where possible
 * - Keeps future extension fields intact
 */
export function normalizeBillingProfile(input) {
  const obj = input && typeof input === 'object' ? input : {};
  const stripe = obj.stripe && typeof obj.stripe === 'object' ? obj.stripe : {};

  const normalized = {
    plan: obj.plan,
    billingStatus: obj.billingStatus,
    trialEndsAt: obj.trialEndsAt,

    stripe: {
      customerId: stripe.customerId ?? null,
      subscriptionId: stripe.subscriptionId ?? null,
      priceId: stripe.priceId ?? null,
    },

    updatedAt: obj.updatedAt,
  };

  // Keep forward-compatible extra fields (non-breaking)
  for (const [k, v] of Object.entries(obj)) {
    if (!(k in normalized)) normalized[k] = v;
  }

  return normalized;
}

/**
 * Validates billing profile. Returns { ok, errors, normalized }.
 * This is intentionally strict on shape, but tolerant on unknown extra fields.
 * @param {any} input
 */
export function validateBillingProfile(input) {
  const errors = [];
  const p = normalizeBillingProfile(input);

  if (!Object.values(BILLING_PLANS).includes(p.plan)) {
    errors.push(`plan must be one of: ${Object.values(BILLING_PLANS).join(', ')}`);
  }

  if (!Object.values(BILLING_STATUS).includes(p.billingStatus)) {
    errors.push(
      `billingStatus must be one of: ${Object.values(BILLING_STATUS).join(', ')}`
    );
  }

  if (p.plan === BILLING_PLANS.TRIAL) {
    if (!p.trialEndsAt || typeof p.trialEndsAt !== 'string') {
      errors.push('trialEndsAt is required for plan=trial and must be an ISO string');
    } else {
      const d = new Date(p.trialEndsAt);
      if (Number.isNaN(d.getTime())) errors.push('trialEndsAt must be a valid ISO date string');
    }
  }

  if (p.updatedAt && typeof p.updatedAt === 'string') {
    const d = new Date(p.updatedAt);
    if (Number.isNaN(d.getTime())) errors.push('updatedAt must be a valid ISO date string');
  } else if (p.updatedAt != null && typeof p.updatedAt !== 'string') {
    errors.push('updatedAt must be an ISO string if present');
  }

  // Stripe reserved keys must be strings or null
  if (!p.stripe || typeof p.stripe !== 'object') {
    errors.push('stripe must be an object');
  } else {
    for (const key of ['customerId', 'subscriptionId', 'priceId']) {
      const v = p.stripe[key];
      if (!(v === null || typeof v === 'string')) {
        errors.push(`stripe.${key} must be string or null`);
      }
    }
  }

  return { ok: errors.length === 0, errors, normalized: p };
}
