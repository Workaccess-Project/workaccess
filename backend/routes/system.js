// backend/routes/system.js
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { requireRole } from "../auth.js";
import { getCompanyProfile } from "../data-company.js";
import { auditLog } from "../data-audit.js";
import { buildTenantBackupSnapshot } from "../services/tenant-backup.js";
import { restoreTenantBackupSnapshot } from "../services/tenant-restore.js";
import { getTenantStorageDiagnostics } from "../services/tenant-storage-diagnostics.js";

const router = express.Router();
const AUDIT_RESTORE_ACTIONS = new Set([
  "tenant.restore.success",
  "tenant.restore.failed",
]);

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

function getTenantAuditFilePath(companyId) {
  return path.join(process.cwd(), "backend", "data", "tenants", companyId, "audit.json");
}

function getTenantDirectoryPath(companyId) {
  return path.join(process.cwd(), "backend", "data", "tenants", companyId);
}

async function readTenantAuditEntries(companyId) {
  const auditFilePath = getTenantAuditFilePath(companyId);
  const raw = await fs.readFile(auditFilePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("InvalidAuditLog");
  }

  return parsed;
}

function normalizeRestoreHistoryEntry(entry, index) {
  const meta =
    entry?.meta && typeof entry.meta === "object"
      ? entry.meta
      : {};

  const action = (entry?.action ?? "").toString().trim();
  const status = action === "tenant.restore.success" ? "success" : "failed";

  return {
    id:
      (entry?.id ?? "").toString().trim() ||
      `${status}-${index}`,
    timestamp:
      entry?.createdAt ??
      entry?.timestamp ??
      meta?.restoredAt ??
      meta?.safetySnapshotCreatedAt ??
      null,
    action,
    status,
    actorRole: (entry?.actorRole ?? "unknown").toString().trim() || "unknown",
    entityType: (entry?.entityType ?? "").toString().trim() || "system",
    entityId: (entry?.entityId ?? "").toString().trim() || null,
    requestedFileCount:
      typeof meta?.requestedFileCount === "number"
        ? meta.requestedFileCount
        : null,
    restoredFileCount:
      typeof meta?.restoredFileCount === "number"
        ? meta.restoredFileCount
        : null,
    restoredAt: meta?.restoredAt ?? null,
    error: meta?.error ?? null,
    safetySnapshot: {
      fileName: meta?.safetySnapshotFileName ?? null,
      fileCount:
        typeof meta?.safetySnapshotFileCount === "number"
          ? meta.safetySnapshotFileCount
          : null,
      createdAt: meta?.safetySnapshotCreatedAt ?? null,
    },
  };
}

function countJsonEntities(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.length;
  }

  if (parsed && typeof parsed === "object") {
    return Object.keys(parsed).length;
  }

  if (parsed === null || typeof parsed === "undefined") {
    return 0;
  }

  return 1;
}

async function buildTenantDataMetrics(companyId) {
  const tenantDirectoryPath = getTenantDirectoryPath(companyId);
  const directoryEntries = await fs.readdir(tenantDirectoryPath, { withFileTypes: true });

  const fileMetrics = [];
  let totalFiles = 0;
  let totalEntities = 0;

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".json")) {
      continue;
    }

    const filePath = path.join(tenantDirectoryPath, entry.name);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const entityCount = countJsonEntities(parsed);

    fileMetrics.push({
      fileName: entry.name,
      entityCount,
    });

    totalFiles += 1;
    totalEntities += entityCount;
  }

  fileMetrics.sort((a, b) => a.fileName.localeCompare(b.fileName));

  return {
    ok: true,
    companyId,
    files: fileMetrics,
    totals: {
      files: totalFiles,
      entities: totalEntities,
    },
  };
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
 * GET /api/system/storage-diagnostics
 * Admin/manager tenant storage diagnostics.
 */
router.get("/storage-diagnostics", requireRole(["admin", "manager"]), async (req, res, next) => {
  try {
    const companyId = (req.auth?.companyId ?? "").toString().trim();
    const diagnostics = await getTenantStorageDiagnostics(companyId);
    return res.json(diagnostics);
  } catch (err) {
    if (err?.message === "MissingCompanyId") {
      return res.status(400).json({
        error: "MissingCompanyId",
        message: "Missing companyId in authenticated context.",
      });
    }

    if (err?.message === "TenantNotFound") {
      return res.status(404).json({
        error: "TenantNotFound",
        message: "Tenant storage directory was not found.",
      });
    }

    return next(err);
  }
});

/**
 * GET /api/system/tenant-data-metrics
 * Admin/manager tenant entity counts per JSON file.
 */
router.get("/tenant-data-metrics", requireRole(["admin", "manager"]), async (req, res, next) => {
  try {
    const companyId = (req.auth?.companyId ?? "").toString().trim();

    if (!companyId) {
      return res.status(400).json({
        error: "MissingCompanyId",
        message: "Missing companyId in authenticated context.",
      });
    }

    const metrics = await buildTenantDataMetrics(companyId);
    return res.json(metrics);
  } catch (err) {
    if (err?.code === "ENOENT") {
      return res.status(404).json({
        error: "TenantNotFound",
        message: "Tenant storage directory was not found.",
      });
    }

    if (err instanceof SyntaxError) {
      return res.status(500).json({
        error: "InvalidTenantDataFile",
        message: "One or more tenant JSON files are invalid.",
      });
    }

    return next(err);
  }
});

/**
 * GET /api/system/restore-history
 * Admin/manager restore history diagnostics from tenant audit log.
 */
router.get("/restore-history", requireRole(["admin", "manager"]), async (req, res, next) => {
  try {
    const companyId = (req.auth?.companyId ?? "").toString().trim();

    if (!companyId) {
      return res.status(400).json({
        error: "MissingCompanyId",
        message: "Missing companyId in authenticated context.",
      });
    }

    const limitRaw = Number.parseInt((req.query?.limit ?? "20").toString(), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 20;

    const auditEntries = await readTenantAuditEntries(companyId);

    const history = auditEntries
      .filter((entry) => AUDIT_RESTORE_ACTIONS.has((entry?.action ?? "").toString().trim()))
      .map((entry, index) => normalizeRestoreHistoryEntry(entry, index))
      .sort((a, b) => {
        const timeA = a.timestamp ? Date.parse(a.timestamp) : 0;
        const timeB = b.timestamp ? Date.parse(b.timestamp) : 0;
        return timeB - timeA;
      })
      .slice(0, limit);

    return res.json({
      ok: true,
      companyId,
      count: history.length,
      limit,
      items: history,
    });
  } catch (err) {
    if (err?.code === "ENOENT") {
      return res.status(404).json({
        error: "AuditLogNotFound",
        message: "Tenant audit log was not found.",
      });
    }

    if (err?.message === "InvalidAuditLog" || err instanceof SyntaxError) {
      return res.status(500).json({
        error: "InvalidAuditLog",
        message: "Tenant audit log is missing or invalid.",
      });
    }

    return next(err);
  }
});

/**
 * GET /api/system/tenant-backup
 * Admin/manager tenant snapshot export.
 */
router.get("/tenant-backup", requireRole(["admin", "manager"]), async (req, res, next) => {
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
 * Admin/manager tenant snapshot restore.
 */
router.post("/tenant-restore", requireRole(["admin", "manager"]), async (req, res, next) => {
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
