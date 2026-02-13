// backend/data/tenant-store.js

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// base složka: backend/data/tenants
const TENANTS_BASE = path.join(__dirname, "tenants");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function getTenantDir(companyId) {
  return path.join(TENANTS_BASE, companyId);
}

function getEntityPath(companyId, entityName) {
  return path.join(getTenantDir(companyId), `${entityName}.json`);
}

async function ensureEntityFile(companyId, entityName) {
  const tenantDir = getTenantDir(companyId);
  await ensureDir(tenantDir);

  const filePath = getEntityPath(companyId, entityName);

  try {
    await fs.access(filePath);
  } catch {
    // soubor neexistuje → vytvoříme prázdné pole
    await fs.writeFile(filePath, "[]", "utf-8");
  }

  return filePath;
}

export async function readTenantEntity(companyId, entityName) {
  const filePath = await ensureEntityFile(companyId, entityName);
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

export async function writeTenantEntity(companyId, entityName, data) {
  const filePath = await ensureEntityFile(companyId, entityName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
