import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TENANTS_BASE = path.join(__dirname, "..", "data", "tenants");

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

function getTenantDir(companyId) {
  return path.join(TENANTS_BASE, companyId);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function buildTenantBackupSnapshot(companyId) {
  const cid = requireCompanyId(companyId);
  const tenantDir = getTenantDir(cid);

  const exists = await pathExists(tenantDir);
  if (!exists) {
    const err = new Error("Tenant directory not found");
    err.status = 404;
    err.payload = { companyId: cid };
    throw err;
  }

  const dirEntries = await fs.readdir(tenantDir, { withFileTypes: true });
  const jsonFiles = dirEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const files = {};

  for (const fileName of jsonFiles) {
    const filePath = path.join(tenantDir, fileName);
    const raw = await fs.readFile(filePath, "utf-8");
    files[fileName] = JSON.parse(raw);
  }

  return {
    ok: true,
    companyId: cid,
    exportedAt: new Date().toISOString(),
    fileCount: jsonFiles.length,
    files,
  };
}
