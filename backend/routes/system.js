// backend/routes/system.js
import express from "express";
import { getCompanyProfile } from "../data-company.js";

const router = express.Router();

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
    const billing = company?.billing && typeof company.billing === "object"
      ? company.billing
      : null;

    return res.json({
      ok: true,
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

export default router;
