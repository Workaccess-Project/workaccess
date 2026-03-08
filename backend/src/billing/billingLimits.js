export function safeBillingString(v) {
  return (v ?? "").toString().trim();
}

export function resolvePlanForLimits(companyProfile) {
  const billingPlan = safeBillingString(companyProfile?.billing?.plan).toLowerCase();
  if (billingPlan) return billingPlan;

  const legacyPlan = safeBillingString(companyProfile?.plan).toLowerCase();
  if (legacyPlan === "free") return "trial";
  if (legacyPlan) return legacyPlan;

  return "basic";
}

export function getMaxEmployeesForPlan(planRaw) {
  const plan = safeBillingString(planRaw).toLowerCase();

  if (plan === "enterprise") return null; // unlimited
  if (plan === "pro") return 10;
  if (plan === "trial") return 3;
  if (plan === "basic") return 3;
  if (plan === "free") return 3;

  return 3;
}

export function getEmployeeLimitsSnapshot({ companyProfile, employees }) {
  const plan = resolvePlanForLimits(companyProfile);
  const current = Array.isArray(employees) ? employees.length : 0;
  const max = getMaxEmployeesForPlan(plan);

  return {
    plan,
    employees: {
      current,
      max,
      unlimited: max == null,
    },
  };
}
