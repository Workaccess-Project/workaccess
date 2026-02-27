/**
 * Feature Guard Layer (Foundation)
 * --------------------------------
 * Purpose:
 * - Separate feature access rules from billing rules.
 * - Prepare future 403 (feature lock) enforcement without refactoring controllers.
 *
 * NOTE:
 * - This layer does NOT enforce anything globally yet.
 * - Controllers can optionally consult this guard in future boxes.
 *
 * Design principles:
 * - Fail-safe: if company or billing is missing -> deny feature.
 * - Deterministic: same inputs -> same results.
 * - Backwards compatible: unknown plan treated as Basic.
 */

const PLAN = {
  BASIC: "Basic",
  PRO: "Pro",
  BUSINESS: "Business",
};

/**
 * Canonical feature keys.
 * Add new keys here first. Keep them stable (API contract).
 */
const FEATURE = {
  // v1 baseline (safe + minimal)
  USERS: "users",
  DOCUMENTS: "documents",
  PARTNERS: "partners",

  // future expansion-ready (placeholders)
  AUDIT_LOG: "audit_log",
  ROLE_MANAGEMENT: "role_management",
  MULTI_BRANCH: "multi_branch",
  BILLING_UI: "billing_ui",
};

/**
 * Feature policy by plan.
 * Basic = minimal.
 * Pro = extended.
 * Business = all features.
 */
const PLAN_FEATURES = {
  [PLAN.BASIC]: [
    FEATURE.USERS,
    FEATURE.DOCUMENTS,
    FEATURE.PARTNERS,
  ],
  [PLAN.PRO]: [
    FEATURE.USERS,
    FEATURE.DOCUMENTS,
    FEATURE.PARTNERS,
    FEATURE.BILLING_UI,
  ],
  [PLAN.BUSINESS]: [
    ...Object.values(FEATURE),
  ],
};

function normalizePlan(plan) {
  if (!plan || typeof plan !== "string") return PLAN.BASIC;

  const trimmed = plan.trim();

  if (trimmed === PLAN.PRO) return PLAN.PRO;
  if (trimmed === PLAN.BUSINESS) return PLAN.BUSINESS;

  return PLAN.BASIC;
}

/**
 * Returns list of features allowed for given plan.
 */
function getPlanFeatures(plan) {
  const normalized = normalizePlan(plan);
  return PLAN_FEATURES[normalized] || PLAN_FEATURES[PLAN.BASIC];
}

/**
 * Checks if company has access to a feature.
 * Fail-safe: if anything invalid -> false.
 */
function hasFeature(company, featureKey) {
  if (!company || typeof company !== "object") return false;
  if (!featureKey || typeof featureKey !== "string") return false;

  const billing = company.billing;
  const plan = billing && typeof billing === "object" ? billing.plan : null;

  const allowedFeatures = getPlanFeatures(plan);

  return allowedFeatures.includes(featureKey);
}

/**
 * Prepared helper for future 403 enforcement.
 * For now: simple boolean wrapper.
 */
function assertFeature(company, featureKey) {
  return hasFeature(company, featureKey);
}

module.exports = {
  PLAN,
  FEATURE,
  getPlanFeatures,
  hasFeature,
  assertFeature,
};