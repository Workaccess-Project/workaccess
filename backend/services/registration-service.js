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

const COMPANY_ID_MIN = 3;
const COMPANY_ID_MAX = 50;
const COMPANY_NAME_MAX = 120;
const PASSWORD_MIN = 8;

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

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
}

function isValidCompanySlug(v) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
}

function makeAppError(message, status, code, details = null) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
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

function validateRegistrationInput({
  name,
  rawCompanyId,
  companyId,
  adminEmail,
  adminPassword,
}) {
  if (!name) {
    throw makeAppError("Missing field: name", 400, "MISSING_NAME");
  }

  if (name.length > COMPANY_NAME_MAX) {
    throw makeAppError("Invalid name", 400, "INVALID_NAME", {
      maxLength: COMPANY_NAME_MAX,
    });
  }

  if (!rawCompanyId) {
    throw makeAppError("Missing field: companyId", 400, "MISSING_COMPANY_ID");
  }

  if (!companyId) {
    throw makeAppError("Invalid companyId", 400, "INVALID_COMPANY_ID");
  }

  if (
    companyId.length < COMPANY_ID_MIN ||
    companyId.length > COMPANY_ID_MAX ||
    !isValidCompanySlug(companyId)
  ) {
    throw makeAppError("Invalid companyId", 400, "INVALID_COMPANY_ID", {
      minLength: COMPANY_ID_MIN,
      maxLength: COMPANY_ID_MAX,
      format: "lowercase letters, numbers, hyphen",
    });
  }

  if (!adminEmail) {
    throw makeAppError("Missing field: adminEmail", 400, "MISSING_ADMIN_EMAIL");
  }

  if (!isValidEmail(adminEmail)) {
    throw makeAppError("Invalid adminEmail", 400, "INVALID_ADMIN_EMAIL");
  }

  if (!adminPassword) {
    throw makeAppError(
      "Missing field: adminPassword",
      400,
      "MISSING_ADMIN_PASSWORD"
    );
  }

  if (adminPassword.length < PASSWORD_MIN) {
    throw makeAppError(
      "Invalid adminPassword",
      400,
      "INVALID_ADMIN_PASSWORD",
      {
        minLength: PASSWORD_MIN,
      }
    );
  }
}

export async function registerCompanyService(body = {}) {
  const name = safeString(body.name);
  const rawCompanyId = safeString(body.companyId);

  const adminEmail = normalizeEmail(body.adminEmail);
  const adminPassword = safeString(body.adminPassword);
  const adminName = safeString(body.adminName);

  const companyId = slugifyCompanyId(rawCompanyId);

  validateRegistrationInput({
    name,
    rawCompanyId,
    companyId,
    adminEmail,
    adminPassword,
  });

  const exists = await tenantExists(companyId);
  if (exists) {
    throw makeAppError("Company already exists", 409, "COMPANY_EXISTS", {
      companyId,
    });
  }

  const tenantPath = path.join(TENANTS_DIR, companyId);
  let tenantCreated = false;

  try {
    await fs.mkdir(tenantPath, { recursive: false });
    tenantCreated = true;

    await getCompanyProfile(companyId);

    const trial = trialDates();

    await updateCompanyProfile(companyId, {
      name,
      trialStart: trial.trialStart,
      trialEnd: trial.trialEnd,
    });

    await seedDefaultCompanyDocumentTemplates(companyId);

    const createdUser = await createUser(companyId, {
      email: adminEmail,
      password: adminPassword,
      name: adminName,
      role: "manager",
    });

    const token = signAccessToken(createdUser);

    return {
      ok: true,
      companyId,
      trialStart: trial.trialStart,
      trialEnd: trial.trialEnd,
      token,
      user: createdUser,
    };
  } catch (err) {
    if (tenantCreated) {
      try {
        await fs.rm(tenantPath, { recursive: true, force: true });
      } catch {}
    }

    if (err && err.code === "EEXIST") {
      throw makeAppError("Company already exists", 409, "COMPANY_EXISTS", {
        companyId,
      });
    }

    throw err;
  }
}
