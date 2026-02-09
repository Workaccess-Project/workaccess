// backend/data-audit.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ukládáme do backend/audit.json
const AUDIT_PATH = path.join(__dirname, "audit.json");

// kolik záznamů max držíme v souboru (aby to nerostlo do nekonečna)
const MAX_AUDIT = 5000;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "aud") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureFile() {
  try {
    await fs.access(AUDIT_PATH);
  } catch {
    await fs.writeFile(AUDIT_PATH, "[]", "utf-8");
  }
}

async function readAuditRaw() {
  await ensureFile();
  const raw = await fs.readFile(AUDIT_PATH, "utf-8");
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAuditRaw(arr) {
  await ensureFile();
  await fs.writeFile(AUDIT_PATH, JSON.stringify(arr, null, 2), "utf-8");
}

/**
 * Přidá audit záznam.
 * actorRole: "hr" | "manager" | "security" | "external"
 * action: string (např. "employee.create", "training.update" ...)
 * entityType: string (např. "employee", "training", "item")
 * entityId: id entity
 * meta: objekt s doplňkovými info (např. employeeId, trainingId)
 * before/after: snapshoty před a po
 */
export async function auditLog({
  actorRole = "unknown",
  action = "unknown",
  entityType = "unknown",
  entityId = null,
  meta = {},
  before = null,
  after = null,
} = {}) {
  const arr = await readAuditRaw();

  const entry = {
    id: makeId("aud"),
    ts: nowIso(),
    actorRole: String(actorRole || "unknown"),
    action: String(action || "unknown"),
    entityType: String(entityType || "unknown"),
    entityId: entityId == null ? null : String(entityId),
    meta: meta && typeof meta === "object" ? meta : {},
    before,
    after,
  };

  arr.push(entry);

  // udržujeme max velikost
  const trimmed = arr.length > MAX_AUDIT ? arr.slice(arr.length - MAX_AUDIT) : arr;

  await writeAuditRaw(trimmed);
  return entry;
}

/**
 * Vrátí audit záznamy (nejnovější první)
 */
export async function listAudit(limit = 200) {
  const n = Math.max(1, Math.min(1000, Number(limit) || 200));
  const arr = await readAuditRaw();
  const newestFirst = arr.slice().reverse();
  return newestFirst.slice(0, n);
}
