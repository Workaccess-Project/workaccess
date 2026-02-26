// backend/data-company.js
import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";
import {
  createDefaultBillingProfile,
  validateBillingProfile,
  BILLING_PLANS,
  BILLING_STATUS,
} from "./src/billing/billingModel.js";

const ENTITY = "company";

function nowIso() {
  return new Date().toISOString();
}

function safeString(v) {
  return (v ?? "").toString().trim();
}

function requireCompanyId(companyId) {
  const cid = safeString(companyId);
  if (!cid) {
    const err = new Error("Missing companyId");
    err.status = 400;
    throw err;
  }
  return cid;
}

function defaultAlerts() {
  return {
    expirationsDays: 30,
    digestEmail: "",
    digestRecipientContactId: "",
    lastDigestSentOn: "", // YYYY-MM-DD
  };
}

function defaultCompany(companyId) {
  const createdAt = nowIso();

  return {
    companyId: safeString(companyId),
    name: "",
    ico: "",
    dic: "",
    address: "",
    city: "",
    zip: "",
    country: "CZ",
    email: "",
    phone: "",
    alerts: defaultAlerts(),

    // Legacy SaaS trial (ISO strings) - kept for backward compatibility
    trialStart: "",
    trialEnd: "",

    // Legacy subscription skeleton (ISO strings) - kept for backward compatibility
    subscriptionStatus: "none", // none | active | past_due | canceled
    plan: "free", // free | basic | pro
    paymentProvider: "", // e.g. "manual"
    subscriptionStart: "",
    subscriptionEnd: "",

    // v36 Billing model (canonical going forward)
    billing: createDefaultBillingProfile({ now: new Date(createdAt), trialDays: 14 }),

    updatedAt: createdAt,
    createdAt,
  };
}

function normalizeIsoDateString(v) {
  const s = safeString(v);
  if (!s) return "";
  const d = new Date(s);
  if (String(d) === "Invalid Date") return "";
  return d.toISOString();
}

function normalizeAlertsBody(body = {}, prev = defaultAlerts()) {
  const daysRaw = body?.expirationsDays ?? prev.expirationsDays ?? 30;
  const daysNum = Number(daysRaw);
  const expirationsDays = Number.isFinite(daysNum)
    ? Math.max(1, Math.min(365, Math.floor(daysNum)))
    : 30;

  const lastDigestSentOn = safeString(body?.lastDigestSentOn ?? prev.lastDigestSentOn);

  return {
    expirationsDays,
    digestEmail: safeString(body?.digestEmail ?? prev.digestEmail),
    digestRecipientContactId: safeString(body?.digestRecipientContactId ?? prev.digestRecipientContactId),
    lastDigestSentOn,
  };
}

function normalizeSubscriptionBody(body = {}, prev = {}) {
  // Pozor: subscription měníme explicitně (billing endpointy),
  // ale chceme umožnit i bezpečnou migraci a případný interní patch přes updateCompanyProfile.
  const status = safeString(body.subscriptionStatus ?? prev.subscriptionStatus) || "none";
  const plan = safeString(body.plan ?? prev.plan) || "free";
  const paymentProvider = safeString(body.paymentProvider ?? prev.paymentProvider);

  return {
    subscriptionStatus: status,
    plan,
    paymentProvider,
    subscriptionStart: normalizeIsoDateString(body.subscriptionStart ?? prev.subscriptionStart),
    subscriptionEnd: normalizeIsoDateString(body.subscriptionEnd ?? prev.subscriptionEnd),
  };
}

function normalizeCompanyBody(body = {}, prev = {}) {
  const prevAlerts =
    prev?.alerts && typeof prev.alerts === "object" ? prev.alerts : defaultAlerts();

  const prevSub = prev && typeof prev === "object" ? prev : {};

  return {
    ...prev,
    name: safeString(body.name ?? prev.name),
    ico: safeString(body.ico ?? prev.ico),
    dic: safeString(body.dic ?? prev.dic),
    address: safeString(body.address ?? prev.address),
    city: safeString(body.city ?? prev.city),
    zip: safeString(body.zip ?? prev.zip),
    country: safeString(body.country ?? prev.country) || "CZ",
    email: safeString(body.email ?? prev.email),
    phone: safeString(body.phone ?? prev.phone),

    // trial fields (keep if not provided)
    trialStart: normalizeIsoDateString(body.trialStart ?? prev.trialStart),
    trialEnd: normalizeIsoDateString(body.trialEnd ?? prev.trialEnd),

    // subscription fields (keep if not provided)
    ...normalizeSubscriptionBody(body, prevSub),

    // alerts může přijít buď jako body.alerts, nebo přímo v body (kompatibilita)
    alerts: normalizeAlertsBody(body.alerts ?? body, prevAlerts),

    // Billing is not patched via generic profile update (handled by dedicated billing flows)
    billing: prev.billing,
  };
}

/**
 * Builds a canonical v36 billing profile with safe migration from legacy fields.
 */
function buildBillingProfileFromCompany(mergedCompany) {
  const createdAtIso = mergedCompany?.createdAt ? normalizeIsoDateString(mergedCompany.createdAt) : "";
  const createdAt = createdAtIso ? new Date(createdAtIso) : new Date();

  // 1) If billing already exists -> validate; if invalid -> reset to default
  if (mergedCompany?.billing) {
    const v = validateBillingProfile(mergedCompany.billing);
    if (v.ok) return v.normalized;

    // invalid -> reset (but keep original for debugging / audit)
    return {
      ...createDefaultBillingProfile({ now: createdAt, trialDays: 14 }),
      legacyInvalidBilling: mergedCompany.billing,
    };
  }

  // 2) Legacy trialEnd migration (if present)
  const legacyTrialEnd = normalizeIsoDateString(mergedCompany?.trialEnd);
  if (legacyTrialEnd) {
    const now = new Date();
    const trialEndDate = new Date(legacyTrialEnd);
    const expired = now.getTime() > trialEndDate.getTime();

    return {
      ...createDefaultBillingProfile({ now: createdAt, trialDays: 14 }),
      plan: BILLING_PLANS.TRIAL,
      billingStatus: expired ? BILLING_STATUS.PAST_DUE : BILLING_STATUS.TRIALING,
      trialEndsAt: legacyTrialEnd,
      updatedAt: now.toISOString(),
    };
  }

  // 3) Default billing for legacy tenants without trial info
  return createDefaultBillingProfile({ now: createdAt, trialDays: 14 });
}

export async function getCompanyProfile(companyId) {
  const cid = requireCompanyId(companyId);
  const data = await readTenantEntity(cid, ENTITY);

  // tenant-store zakládá [] -> my chceme objekt
  if (Array.isArray(data)) {
    const def = defaultCompany(cid);
    await writeTenantEntity(cid, ENTITY, def);
    return def;
  }

  if (!data || typeof data !== "object") {
    const def = defaultCompany(cid);
    await writeTenantEntity(cid, ENTITY, def);
    return def;
  }

  // jemná migrace: doplníme missing fields včetně trial + alerts + subscription + billing(v36)
  const def = defaultCompany(cid);
  const merged = { ...def, ...data };

  const aDef = defaultAlerts();
  const aData = merged?.alerts && typeof merged.alerts === "object" ? merged.alerts : {};
  merged.alerts = { ...aDef, ...aData };

  // trial normalize (legacy)
  merged.trialStart = normalizeIsoDateString(merged.trialStart);
  merged.trialEnd = normalizeIsoDateString(merged.trialEnd);

  // subscription normalize (legacy)
  const sub = normalizeSubscriptionBody(merged, merged);
  merged.subscriptionStatus = sub.subscriptionStatus;
  merged.plan = sub.plan;
  merged.paymentProvider = sub.paymentProvider;
  merged.subscriptionStart = sub.subscriptionStart;
  merged.subscriptionEnd = sub.subscriptionEnd;

  // v36 billing normalize + migrate
  merged.billing = buildBillingProfileFromCompany(merged);

  if (!merged.createdAt) merged.createdAt = def.createdAt;
  merged.updatedAt = merged.updatedAt || def.updatedAt;

  const changed = JSON.stringify(merged) !== JSON.stringify(data);
  if (changed) await writeTenantEntity(cid, ENTITY, merged);

  return merged;
}

export async function updateCompanyProfile(companyId, body) {
  const cid = requireCompanyId(companyId);
  const prev = await getCompanyProfile(cid);

  const next = {
    ...normalizeCompanyBody(body, prev),
    companyId: cid,
    createdAt: prev.createdAt || prev.createdAt,
    updatedAt: nowIso(),
  };

  await writeTenantEntity(cid, ENTITY, next);
  return { before: prev, after: next };
}
