// backend/services/registration-service.js

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getCompanyProfile, updateCompanyProfile } from "../data-company.js";
import { createUser } from "../data-users.js";
import { signAccessToken } from "./auth.service.js";
import { seedDefaultCompanyDocumentTemplates } from "./company-document-templates-seed.js";

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

function normalizeEmail(v) {
  return safeString(v).toLowerCase();
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
    throw err;
  }
}

export async function registerCompanyService(body = {}) {
  const name = safeString(body.name);
  const rawCompanyId = safeString(body.companyId);

  const adminEmail = normalizeEmail(body.adminEmail);
  const adminPassword = safeString(body.adminPassword);
  const adminName = safeString(body.adminName);

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

  if (!adminEmail) {
    const err = new Error("Missing field: adminEmail");
    err.status = 400;
    throw err;
  }

  if (!adminPassword) {
    const err = new Error("Missing field: adminPassword");
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

  // 3) initialize default company profile via tenant-store
  await getCompanyProfile(companyId);

  const trial = trialDates();

  await updateCompanyProfile(companyId, {
    name,
    trialStart: trial.trialStart,
    trialEnd: trial.trialEnd,
  });

  // 3b) seed default templates (new companies should not be empty)
  await seedDefaultCompanyDocumentTemplates(companyId);

  // 4) create first admin user (manager)
  const createdUser = await createUser(companyId, {
    email: adminEmail,
    password: adminPassword,
    name: adminName,
    role: "manager",
  });

  // 5) return token (auto-login)
  const token = signAccessToken(createdUser);

  return {
    ok: true,
    companyId,
    trialStart: trial.trialStart,
    trialEnd: trial.trialEnd,
    token,
    user: createdUser,
  };
}