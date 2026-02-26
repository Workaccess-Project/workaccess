// src/billing/trialEvaluator.js
import { getCompanyProfile } from "../../data-company.js";
import { writeTenantEntity } from "../../data/tenant-store.js";
import { BILLING_PLANS, BILLING_STATUS } from "./billingModel.js";

/**
 * Evaluates and updates trial status if needed.
 * Safe to call on every authenticated request.
 */
export async function evaluateTrialIfNeeded(companyId) {
  if (!companyId) return;

  const company = await getCompanyProfile(companyId);
  const billing = company?.billing;

  if (!billing) return;

  if (billing.plan !== BILLING_PLANS.TRIAL) return;

  if (!billing.trialEndsAt) return;

  const now = new Date();
  const trialEnd = new Date(billing.trialEndsAt);

  if (Number.isNaN(trialEnd.getTime())) return;

  const expired = now.getTime() > trialEnd.getTime();

  if (expired && billing.billingStatus !== BILLING_STATUS.PAST_DUE) {
    const updated = {
      ...company,
      billing: {
        ...billing,
        billingStatus: BILLING_STATUS.PAST_DUE,
        updatedAt: now.toISOString(),
      },
      updatedAt: now.toISOString(),
    };

    await writeTenantEntity(companyId, "company", updated);
  }
}
