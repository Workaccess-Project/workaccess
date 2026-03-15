// backend/services/tenant-restore.js
import fs from "fs/promises";
import path from "path";

const TENANTS_ROOT = path.resolve("backend/data/tenants");
const RESTORE_SAFETY_ROOT = path.resolve("backend/data/restore-safety");
const MAX_RESTORE_SAFETY_SNAPSHOTS_PER_TENANT = 5;

function assertSafeCompanyId(companyId) {
  const value = (companyId ?? "").toString().trim();

  if (!value) {
    throw new Error("MissingCompanyId");
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error("InvalidCompanyId");
  }

  return value;
}

function normalizeRelativeFilePath(filePath) {
  const value = (filePath ?? "").toString().replace(/\\/g, "/").trim();

  if (!value) {
    throw new Error("InvalidBackupPath");
  }

  if (path.isAbsolute(value)) {
    throw new Error("InvalidBackupPath");
  }

  const normalized = path.posix.normalize(value);

  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    throw new Error("InvalidBackupPath");
  }

  return normalized;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getPayloadFiles(payload) {
  if (Array.isArray(payload?.files)) {
    return payload.files;
  }

  if (payload?.files && typeof payload.files === "object") {
    return Object.entries(payload.files).map(([filePath, content]) => ({
      path: filePath,
      content,
    }));
  }

  return null;
}

async function removeDirectoryContents(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    await fs.rm(fullPath, { recursive: true, force: true });
  }
}

async function listRestoreSafetySnapshotEntries(companySafetyDir) {
  const dirExists = await pathExists(companySafetyDir);

  if (!dirExists) {
    return [];
  }

  const entries = await fs.readdir(companySafetyDir, { withFileTypes: true });
  const snapshotEntries = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
      continue;
    }

    const fullPath = path.join(companySafetyDir, entry.name);
    const stats = await fs.stat(fullPath);

    snapshotEntries.push({
      name: entry.name,
      fullPath,
      modifiedTimeMs: stats.mtimeMs,
    });
  }

  snapshotEntries.sort((a, b) => {
    if (b.modifiedTimeMs !== a.modifiedTimeMs) {
      return b.modifiedTimeMs - a.modifiedTimeMs;
    }

    return b.name.localeCompare(a.name);
  });

  return snapshotEntries;
}

async function cleanupOldRestoreSafetySnapshots(companySafetyDir) {
  const snapshotEntries = await listRestoreSafetySnapshotEntries(companySafetyDir);
  const snapshotCountBeforeCleanup = snapshotEntries.length;

  const entriesToDelete = snapshotEntries.slice(
    MAX_RESTORE_SAFETY_SNAPSHOTS_PER_TENANT
  );

  const deletedSnapshotFileNames = [];

  for (const entry of entriesToDelete) {
    await fs.rm(entry.fullPath, { force: true });
    deletedSnapshotFileNames.push(entry.name);
  }

  const snapshotCountAfterCleanup =
    snapshotCountBeforeCleanup - deletedSnapshotFileNames.length;

  return {
    retentionLimit: MAX_RESTORE_SAFETY_SNAPSHOTS_PER_TENANT,
    snapshotCountBeforeCleanup,
    snapshotCountAfterCleanup,
    deletedSnapshotFileNames,
  };
}

async function buildPreRestoreSafetySnapshot(safeCompanyId, resolvedTenantDir) {
  const tenantExists = await pathExists(resolvedTenantDir);
  const files = {};

  if (tenantExists) {
    const entries = await fs.readdir(resolvedTenantDir, { withFileTypes: true });
    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    for (const fileName of jsonFiles) {
      const filePath = path.join(resolvedTenantDir, fileName);
      const raw = await fs.readFile(filePath, "utf8");

      try {
        files[fileName] = JSON.parse(raw);
      } catch {
        files[fileName] = raw;
      }
    }
  }

  const exportedAt = new Date().toISOString();
  const snapshot = {
    ok: true,
    companyId: safeCompanyId,
    exportedAt,
    fileCount: Object.keys(files).length,
    files,
  };

  const companySafetyDir = path.join(RESTORE_SAFETY_ROOT, safeCompanyId);
  const timestamp = exportedAt.replace(/[:.]/g, "-");
  const fileName = `${safeCompanyId}-pre-restore-${timestamp}.json`;
  const snapshotPath = path.join(companySafetyDir, fileName);

  await fs.mkdir(companySafetyDir, { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");

  const cleanupSummary = await cleanupOldRestoreSafetySnapshots(companySafetyDir);

  return {
    createdAt: exportedAt,
    fileCount: snapshot.fileCount,
    fileName,
    relativePath: path.relative(process.cwd(), snapshotPath).replace(/\\/g, "/"),
    retentionLimit: cleanupSummary.retentionLimit,
    snapshotCountBeforeCleanup: cleanupSummary.snapshotCountBeforeCleanup,
    snapshotCountAfterCleanup: cleanupSummary.snapshotCountAfterCleanup,
    deletedSnapshotFileNames: cleanupSummary.deletedSnapshotFileNames,
  };
}

/**
 * Restore current tenant storage from snapshot payload.
 *
 * Supported payload formats:
 * {
 *   files: [
 *     { path: "company.json", content: "{...}" }
 *   ]
 * }
 *
 * or:
 *
 * {
 *   files: {
 *     "company.json": { ... }
 *   }
 * }
 */
export async function restoreTenantBackupSnapshot(companyId, payload) {
  const safeCompanyId = assertSafeCompanyId(companyId);
  const tenantDir = path.join(TENANTS_ROOT, safeCompanyId);
  const resolvedTenantDir = path.resolve(tenantDir);

  if (
    resolvedTenantDir !== TENANTS_ROOT &&
    !resolvedTenantDir.startsWith(TENANTS_ROOT + path.sep)
  ) {
    throw new Error("InvalidTenantDirectory");
  }

  const files = getPayloadFiles(payload);

  if (!files || files.length === 0) {
    throw new Error("InvalidBackupPayload");
  }

  const preparedFiles = files.map((file, index) => {
    const relativePath = normalizeRelativeFilePath(file?.path);
    const content =
      typeof file?.content === "string"
        ? file.content
        : JSON.stringify(file?.content ?? null, null, 2);

    const destination = path.join(resolvedTenantDir, relativePath);
    const resolvedDestination = path.resolve(destination);

    if (
      resolvedDestination !== resolvedTenantDir &&
      !resolvedDestination.startsWith(resolvedTenantDir + path.sep)
    ) {
      throw new Error(`InvalidBackupPathAtIndex:${index}`);
    }

    return {
      relativePath,
      content,
      destination: resolvedDestination,
    };
  });

  const safetySnapshot = await buildPreRestoreSafetySnapshot(
    safeCompanyId,
    resolvedTenantDir
  );

  try {
    await removeDirectoryContents(resolvedTenantDir);

    for (const file of preparedFiles) {
      await fs.mkdir(path.dirname(file.destination), { recursive: true });
      await fs.writeFile(file.destination, file.content, "utf8");
    }

    return {
      ok: true,
      companyId: safeCompanyId,
      restoredAt: new Date().toISOString(),
      fileCount: preparedFiles.length,
      safetySnapshot,
    };
  } catch (err) {
    err.safetySnapshot = safetySnapshot;
    throw err;
  }
}
