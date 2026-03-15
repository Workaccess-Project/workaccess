import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TENANTS_BASE = path.join(__dirname, "..", "data", "tenants");
const RESTORE_SAFETY_BASE = path.join(__dirname, "..", "data", "restore-safety");

function safeString(value) {
  return (value ?? "").toString().trim();
}

function requireCompanyId(companyId) {
  const cid = safeString(companyId);
  if (!cid) {
    const err = new Error("MissingCompanyId");
    err.status = 400;
    throw err;
  }

  return cid;
}

function getTenantDir(companyId) {
  return path.join(TENANTS_BASE, companyId);
}

function getRestoreSafetyDir(companyId) {
  return path.join(RESTORE_SAFETY_BASE, companyId);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectDirectoryStats(dirPath) {
  const exists = await pathExists(dirPath);

  if (!exists) {
    return {
      exists: false,
      fileCount: 0,
      totalSizeBytes: 0,
    };
  }

  let fileCount = 0;
  let totalSizeBytes = 0;

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stat = await fs.stat(entryPath);
      fileCount += 1;
      totalSizeBytes += stat.size;
    }
  }

  await walk(dirPath);

  return {
    exists: true,
    fileCount,
    totalSizeBytes,
  };
}

export async function getTenantStorageDiagnostics(companyId) {
  const cid = requireCompanyId(companyId);

  const tenantDir = getTenantDir(cid);
  const restoreSafetyDir = getRestoreSafetyDir(cid);

  const tenantStats = await collectDirectoryStats(tenantDir);

  if (!tenantStats.exists) {
    const err = new Error("TenantNotFound");
    err.status = 404;
    err.payload = { companyId: cid };
    throw err;
  }

  const restoreSafetyStats = await collectDirectoryStats(restoreSafetyDir);

  return {
    ok: true,
    companyId: cid,
    measuredAt: new Date().toISOString(),
    tenantStorage: {
      path: tenantDir,
      exists: tenantStats.exists,
      fileCount: tenantStats.fileCount,
      totalSizeBytes: tenantStats.totalSizeBytes,
    },
    restoreSafetyStorage: {
      path: restoreSafetyDir,
      exists: restoreSafetyStats.exists,
      fileCount: restoreSafetyStats.fileCount,
      totalSizeBytes: restoreSafetyStats.totalSizeBytes,
    },
  };
}
