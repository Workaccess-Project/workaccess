'use strict';

import { BILLING_PLANS, BILLING_STATUS } from './billingModel.js';

function safeString(v) {
  return (v ?? '').toString().trim();
}

function parseIsoOrNull(v) {
  const s = safeString(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isExpiredIso(v, now = new Date()) {
  const d = parseIsoOrNull(v);
  if (!d) return false;
  return d.getTime() < now.getTime();
}

/**
 * BOX #90 - Billing Status Consistency Guard
 *
 * Pure sanitizer for canonical billing state.
 *
 * Goals:
 * - prevent inconsistent combinations like:
 *   - plan=trial + billingStatus=active
 *   - plan=trial + billingStatus=past_due
 *   - plan=basic/pro/enterprise + billingStatus=trialing
 * - keep lifecycle stable without redesigning Stripe flow
 * - no side effects, no writes, no logging
 *
 * Rules:
 * - trial + expired trialEndsAt => unpaid
 * - trial + active/past_due => trialing (unless expired => unpaid)
 * - paid plan + trialing => active
 * - non-trial plan should not keep trialEndsAt
 */
export function sanitizeBillingState(input, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();

  const billing = input && typeof input === 'object' ? input : {};
  const stripe =
    billing.stripe && typeof billing.stripe === 'object' ? billing.stripe : {};

  const next = {
    ...billing,
    stripe: {
      customerId: stripe.customerId ?? null,
      subscriptionId: stripe.subscriptionId ?? null,
      priceId: stripe.priceId ?? null,
    },
  };

  const adjustments = [];

  const plan = safeString(next.plan).toLowerCase();
  const status = safeString(next.billingStatus).toLowerCase();
  const expiredTrial = isExpiredIso(next.trialEndsAt, now);

  if (plan === BILLING_PLANS.TRIAL) {
    if (expiredTrial && status !== BILLING_STATUS.UNPAID) {
      next.billingStatus = BILLING_STATUS.UNPAID;
      adjustments.push('trial_expired_forced_to_unpaid');
    } else if (
      !expiredTrial &&
      (status === BILLING_STATUS.ACTIVE || status === BILLING_STATUS.PAST_DUE)
    ) {
      next.billingStatus = BILLING_STATUS.TRIALING;
      adjustments.push('trial_status_normalized_to_trialing');
    }
  }

  if (
    plan &&
    plan !== BILLING_PLANS.TRIAL &&
    status === BILLING_STATUS.TRIALING
  ) {
    next.billingStatus = BILLING_STATUS.ACTIVE;
    adjustments.push('paid_plan_trialing_normalized_to_active');
  }

  if (plan && plan !== BILLING_PLANS.TRIAL && next.trialEndsAt != null) {
    next.trialEndsAt = null;
    adjustments.push('non_trial_plan_cleared_trialEndsAt');
  }

  return {
    billing: next,
    changed: adjustments.length > 0,
    adjustments,
  };
}
