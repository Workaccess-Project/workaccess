// backend/routes/system.js
import express from "express";
import { requireRole } from "../auth.js";
import { getCompanyProfile } from "../data-company.js";
import { auditLog } from "../data-audit.js";
import { buildTenantBackupSnapshot } from "../services/tenant-backup.js";
import { restoreTenantBackupSnapshot } from "../services/tenant-restore.js";

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

function getRequestedFileCount(body) {
  if (Array.isArray(body?.files)) {
    return body.files.length;
  }

  if (body?.files && typeof body.files === "object") {
    return Object.keys(body.files).length;
  }

  return 0;
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

/**
 * POST /api/system/tenant-restore
 * Admin-only tenant snapshot restore.
 */
router.post("/tenant-restore", requireRole(["admin"]), async (req, res, next) => {
  const companyId = (req.auth?.companyId ?? "").toString().trim();
  const actorRole = (req.auth?.role ?? "unknown").toString().trim() || "unknown";
  const confirmation = (req.body?.confirmation ?? "").toString().trim();
  const requestedFileCount = getRequestedFileCount(req.body);

  try {
    if (!companyId) {
      return res.status(400).json({
        error: "MissingCompanyId",
        message: "Missing companyId in authenticated context.",
      });
    }

    if (confirmation !== "RESTORE") {
      return res.status(400).json({
        error: "RestoreConfirmationRequired",
        message: 'Restore requires explicit confirmation value "RESTORE".',
      });
    }

    const result = await restoreTenantBackupSnapshot(companyId, req.body);

    await auditLog({
      companyId,
      actorRole,
      action: "tenant.restore.success",
      entityType: "system",
      entityId: companyId,
      meta: {
        requestedFileCount,
        restoredFileCount: result?.fileCount ?? requestedFileCount,
        restoredAt: result?.restoredAt ?? null,
        safetySnapshotFileName: result?.safetySnapshot?.fileName ?? null,
        safetySnapshotFileCount: result?.safetySnapshot?.fileCount ?? null,
        safetySnapshotCreatedAt: result?.safetySnapshot?.createdAt ?? null,
      },
    });

    return res.json(result);
  } catch (err) {
    if (companyId) {
      try {
        await auditLog({
          companyId,
          actorRole,
          action: "tenant.restore.failed",
          entityType: "system",
          entityId: companyId,
          meta: {
            requestedFileCount,
            error: (err?.message ?? "UnknownError").toString(),
            safetySnapshotFileName: err?.safetySnapshot?.fileName ?? null,
            safetySnapshotFileCount: err?.safetySnapshot?.fileCount ?? null,
            safetySnapshotCreatedAt: err?.safetySnapshot?.createdAt ?? null,
          },
        });
      } catch (auditErr) {
        console.error("tenant restore audit log failed", auditErr);
      }
    }

    if (err?.message === "MissingCompanyId") {
      return res.status(400).json({
        error: "MissingCompanyId",
        message: "Missing companyId in authenticated context.",
      });
    }

    if (err?.message === "InvalidCompanyId") {
      return res.status(400).json({
        error: "InvalidCompanyId",
        message: "Invalid authenticated companyId.",
      });
    }

    if (
      err?.message === "InvalidBackupPayload" ||
      err?.message === "InvalidBackupPath" ||
      String(err?.message ?? "").startsWith("InvalidBackupPathAtIndex:")
    ) {
      return res.status(400).json({
        error: "InvalidBackupPayload",
        message: "Backup payload must contain safe relative file paths and file content.",
      });
    }

    return next(err);
  }
});

export default router;
