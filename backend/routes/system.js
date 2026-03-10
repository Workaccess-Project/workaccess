// backend/routes/system.js
import express from "express";
import { requireRole } from "../auth.js";
import { getCompanyProfile } from "../data-company.js";
import { buildTenantBackupSnapshot } from "../services/tenant-backup.js";

const router = express.Router();

/**
 * Detect Stripe mode (test / live)
 */
function detectStripeMode() {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").toString().trim();
  if (key.startsWith("sk_live")) return "live";
  if (key.startsWith("sk_test")) return "test";
  return "unknown";
}

/**
 * GET /api/system/info
 * Safe tenant-scoped system info for UI/debug.
 */
router.get("/info", async (req, res, next) => {
  try {
    const companyId = (req.auth?.companyId ?? "").toString().trim();
    const role = (req.auth?.role ?? "external").toString().trim();

    if (!companyId) {
      return res.status(400).json({
        error: "MissingCompanyId",
        message: "Missing companyId in authenticated context.",
      });
    }

    const company = await getCompanyProfile(companyId);

    const billing =
      company?.billing && typeof company.billing === "object"
        ? company.billing
        : null;

    return res.json({
      ok: true,

      system: {
        environment: (process.env.NODE_ENV ?? "development").toString(),
        node: process.version,
        serverTime: new Date().toISOString(),
        stripeMode: detectStripeMode(),
        version: {
          buildSha: process.env.BUILD_SHA ?? null,
          buildTime: process.env.BUILD_TIME ?? null,
        },
      },

      companyId,
      role,

      company: {
        name: (company?.name ?? "").toString(),
      },

      billing: {
        plan: billing?.plan ?? null,
        billingStatus: billing?.billingStatus ?? null,
        trialEndsAt: billing?.trialEndsAt ?? null,
        updatedAt: billing?.updatedAt ?? null,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/system/tenant-backup
 * Admin-only tenant snapshot export.
 */
router.get("/tenant-backup", requireRole(["admin"]), async (req, res, next) => {
  try {
    const companyId = (req.auth?.companyId ?? "").toString().trim();
    const snapshot = await buildTenantBackupSnapshot(companyId);

    const datePart = new Date().toISOString().slice(0, 10);
    const fileName = `${companyId}-backup-${datePart}.json`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    return res.json(snapshot);
  } catch (err) {
    return next(err);
  }
});

export default router;
