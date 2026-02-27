/**
 * Billing Guard Layer
 * BOX #57.6 – Architecture Expansion Ready (v37)
 *
 * Účel:
 * Centrální enforcement vrstva pro billing logiku.
 *
 * Neřeší Stripe komunikaci.
 * Neřeší databázové změny.
 * Neřeší UI.
 *
 * Slouží jako čistý business layer mezi controllery a billing modelem.
 */

const PLAN_LIMITS = {
  Basic: {
    maxUsers: 3,
  },
  Pro: {
    maxUsers: 10,
  },
  Business: {
    maxUsers: Infinity,
  },
};

/**
 * Vrací limity plánu.
 */
function getPlanLimits(plan) {
  if (!plan) return PLAN_LIMITS.Basic;
  return PLAN_LIMITS[plan] || PLAN_LIMITS.Basic;
}

/**
 * Ověří, zda je billing aktivní.
 * Používá canonical billing model:
 *
 * company.billing = {
 *   plan,
 *   billingStatus,
 *   trialEndsAt,
 *   stripe: { customerId, subscriptionId, priceId },
 *   updatedAt
 * }
 */
function isBillingActive(company) {
  if (!company || !company.billing) return false;

  const { billingStatus, trialEndsAt } = company.billing;

  if (billingStatus === "active") return true;

  if (billingStatus === "trialing") {
    if (!trialEndsAt) return false;
    const now = new Date();
    return new Date(trialEndsAt) > now;
  }

  return false;
}

/**
 * Ověří, zda lze přidat dalšího uživatele.
 * Předpoklad:
 * company.users = pole uživatelů
 */
function canAddUser(company) {
  if (!company) return false;

  const plan = company.billing?.plan || "Basic";
  const limits = getPlanLimits(plan);

  const currentUserCount = Array.isArray(company.users)
    ? company.users.length
    : 0;

  return currentUserCount < limits.maxUsers;
}

/**
 * V budoucnu:
 * - canAccessFeature(company, featureKey)
 * - requireBillingActive middleware
 * - 402 vs 403 rozlišení
 */

module.exports = {
  getPlanLimits,
  isBillingActive,
  canAddUser,
};