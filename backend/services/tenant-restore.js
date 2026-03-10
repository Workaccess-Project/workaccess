// backend/services/tenant-restore.js
import fs from "fs/promises";
import path from "path";

const TENANTS_ROOT = path.resolve("backend/data/tenants");

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

async function removeDirectoryContents(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    await fs.rm(fullPath, { recursive: true, force: true });
  }
}

/**
 * Restore current tenant storage from snapshot payload.
 *
 * Expected payload:
 * {
 *   files: [
 *     { path: "company.json", content: "{...}" }
 *   ]
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

  const files = Array.isArray(payload?.files) ? payload.files : null;

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
  };
}
