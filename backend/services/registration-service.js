// backend/services/registration-service.js

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getCompanyProfile, updateCompanyProfile } from "../data-company.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TENANTS_DIR = path.join(__dirname, "..", "data", "tenants");

function safeString(v) {
  return (v ?? "").toString().trim();
}

function slugifyCompanyId(v) {
  return safeString(v)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function trialDates() {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  return {
    trialStart: now.toISOString(),
    trialEnd: end.toISOString(),
  };
}

async function tenantExists(companyId) {
  const tenantPath = path.join(TENANTS_DIR, companyId);
  try {
    const st = await fs.stat(tenantPath);
    return st.isDirectory();
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    // jiná chyba než "neexistuje" je reálný problém
    throw err;
  }
}

export async function registerCompanyService(body = {}) {
  const name = safeString(body.name);
  const rawCompanyId = safeString(body.companyId);

  if (!name) {
    const err = new Error("Missing field: name");
    err.status = 400;
    throw err;
  }

  if (!rawCompanyId) {
    const err = new Error("Missing field: companyId");
    err.status = 400;
    throw err;
  }

  const companyId = slugifyCompanyId(rawCompanyId);

  if (!companyId) {
    const err = new Error("Invalid companyId");
    err.status = 400;
    throw err;
  }

  // 1) existence check -> 409
  const exists = await tenantExists(companyId);
  if (exists) {
    const err = new Error("Company already exists");
    err.status = 409;
    throw err;
  }

  // 2) create tenant directory
  const tenantPath = path.join(TENANTS_DIR, companyId);
  await fs.mkdir(tenantPath, { recursive: true });

  // 3) initialize company profile via tenant-store (správná cesta, bez ručního fs.writeFile)
  // getCompanyProfile zajistí default strukturu
  await getCompanyProfile(companyId);

  const trial = trialDates();

  // updateCompanyProfile provede merge + zápis do company.json přes tenant-store
  await updateCompanyProfile(companyId, {
    name,
    trialStart: trial.trialStart,
    trialEnd: trial.trialEnd,
  });

  return {
    ok: true,
    companyId,
    trialStart: trial.trialStart,
    trialEnd: trial.trialEnd,
  };
}
