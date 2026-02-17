// backend/routes/billing.js
import express from "express";
import { requireRole } from "../auth.js";
import { getCompanyProfile, updateCompanyProfile } from "../data-company.js";
import { auditLog } from "../data-audit.js";

const router = express.Router();

function safeString(v) {
  return (v ?? "").toString().trim();
}

function nowIso() {
  return new Date().toISOString();
}

function parseIsoOrEmpty(v) {
  const s = safeString(v);
  if (!s) return "";
  const d = new Date(s);
  if (String(d) === "Invalid Date") return "";
  return d.toISOString();
}

function isExpired(iso) {
  const s = safeString(iso);
  if (!s) return false;
  const d = new Date(s);
  if (String(d) === "Invalid Date") return false;
  return d.getTime() < Date.now();
}

function isSubscriptionActive(profile) {
  const status = safeString(profile?.subscriptionStatus).toLowerCase();
  if (status !== "active") return false;

  const end = safeString(profile?.subscriptionEnd);
  if (!end) return false; // pro skeleton chceme mít jasný konec

  return !isExpired(end);
}

function isTrialExpired(profile) {
  const end = safeString(profile?.trialEnd);
  if (!end) return false;
  return isExpired(end);
}

/**
 * GET /api/billing/status
 * READ: pro všechny role (tenant scoped)
 */
router.get("/status", async (req, res) => {
  const companyId = req.auth.companyId;

  const profile = await getCompanyProfile(companyId);

  const trialExpired = isTrialExpired(profile);
  const subscriptionActive = isSubscriptionActive(profile);

  const isLocked = trialExpired && !subscriptionActive;

  res.json({
    companyId,
    trial: {
      start: profile?.trialStart ?? "",
      end: profile?.trialEnd ?? "",
      expired: trialExpired,
    },
    subscription: {
      status: profile?.subscriptionStatus ?? "none",
      plan: profile?.plan ?? "free",
      paymentProvider: profile?.paymentProvider ?? "",
      start: profile?.subscriptionStart ?? "",
      end: profile?.subscriptionEnd ?? "",
      active: subscriptionActive,
      expired: isExpired(profile?.subscriptionEnd ?? ""),
    },
    isLocked,
  });
});

/**
 * POST /api/billing/activate
 * WRITE: manager only
 *
 * Body:
 *  - plan: "free"|"basic"|"pro" (string)
 *  - days: number (default 30)  -> aktivuje od teď na X dní
 *  - until: ISO string (volitelné) -> aktivuje do konkrétního data (má prioritu)
 */
router.post("/activate", requireRole(["manager"]), async (req, res) => {
  const companyId = req.auth.companyId;

  const profileBefore = await getCompanyProfile(companyId);

  const plan = safeString(req.body?.plan) || "basic";

  const untilIso = parseIsoOrEmpty(req.body?.until);
  const daysRaw = Number(req.body?.days);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(3650, Math.floor(daysRaw))) : 30;

  let endIso = "";
  if (untilIso) {
    endIso = untilIso;
  } else {
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    endIso = end.toISOString();
  }

  // nastavíme subscription přes updateCompanyProfile (persist + migrace)
  const patch = {
    subscriptionStatus: "active",
    plan,
    paymentProvider: "manual",
    subscriptionStart: nowIso(),
    subscriptionEnd: endIso,
  };

  const updated = await updateCompanyProfile(companyId, patch);
  const profileAfter = updated.after;

  await auditLog({
    companyId,
    actorRole: req.role,
    action: "billing.activate",
    entityType: "company",
    entityId: companyId,
    meta: { plan, subscriptionEnd: endIso, paymentProvider: "manual" },
    before: {
      subscriptionStatus: profileBefore.subscriptionStatus ?? "none",
      plan: profileBefore.plan ?? "free",
      paymentProvider: profileBefore.paymentProvider ?? "",
      subscriptionStart: profileBefore.subscriptionStart ?? "",
      subscriptionEnd: profileBefore.subscriptionEnd ?? "",
    },
    after: {
      subscriptionStatus: profileAfter.subscriptionStatus ?? "active",
      plan: profileAfter.plan ?? plan,
      paymentProvider: profileAfter.paymentProvider ?? "manual",
      subscriptionStart: profileAfter.subscriptionStart ?? "",
      subscriptionEnd: profileAfter.subscriptionEnd ?? endIso,
    },
  });

  res.json({
    ok: true,
    companyId,
    subscription: {
      status: profileAfter.subscriptionStatus,
      plan: profileAfter.plan,
      paymentProvider: profileAfter.paymentProvider,
      start: profileAfter.subscriptionStart,
      end: profileAfter.subscriptionEnd,
    },
  });
});

/**
 * POST /api/billing/cancel
 * WRITE: manager only
 *
 * Nastaví subscriptionStatus=canceled a subscriptionEnd=now (aby se to hned zamklo po expiraci trialu)
 */
router.post("/cancel", requireRole(["manager"]), async (req, res) => {
  const companyId = req.auth.companyId;

  const profileBefore = await getCompanyProfile(companyId);

  const patch = {
    subscriptionStatus: "canceled",
    subscriptionEnd: nowIso(),
  };

  const updated = await updateCompanyProfile(companyId, patch);
  const profileAfter = updated.after;

  await auditLog({
    companyId,
    actorRole: req.role,
    action: "billing.cancel",
    entityType: "company",
    entityId: companyId,
    meta: {},
    before: {
      subscriptionStatus: profileBefore.subscriptionStatus ?? "none",
      plan: profileBefore.plan ?? "free",
      paymentProvider: profileBefore.paymentProvider ?? "",
      subscriptionStart: profileBefore.subscriptionStart ?? "",
      subscriptionEnd: profileBefore.subscriptionEnd ?? "",
    },
    after: {
      subscriptionStatus: profileAfter.subscriptionStatus ?? "canceled",
      plan: profileAfter.plan ?? "free",
      paymentProvider: profileAfter.paymentProvider ?? "",
      subscriptionStart: profileAfter.subscriptionStart ?? "",
      subscriptionEnd: profileAfter.subscriptionEnd ?? "",
    },
  });

  res.json({
    ok: true,
    companyId,
    subscription: {
      status: profileAfter.subscriptionStatus,
      plan: profileAfter.plan,
      paymentProvider: profileAfter.paymentProvider,
      start: profileAfter.subscriptionStart,
      end: profileAfter.subscriptionEnd,
    },
  });
});

export default router;
