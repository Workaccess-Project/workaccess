// backend/data-employees.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ukládáme do backend/employees.json
const DB_PATH = path.join(__dirname, "employees.json");

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "emp") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function writeDb(arr) {
  await fs.writeFile(DB_PATH, JSON.stringify(arr, null, 2), "utf-8");
}

async function readDb() {
  const raw = await fs.readFile(DB_PATH, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("employees.json must be an array");

  // ✅ AUTO-MIGRACE: doplní id starým školením (když chybí), a jednou to uloží do JSON
  let changed = false;

  for (const emp of data) {
    if (!Array.isArray(emp.trainings)) continue;

    for (const t of emp.trainings) {
      if (!t.id) {
        t.id = makeId("trn");
        changed = true;
      }
      if (t.name != null) t.name = String(t.name);
      if (t.validFrom != null) t.validFrom = String(t.validFrom);
      if (t.validTo != null) t.validTo = String(t.validTo);
    }
  }

  if (changed) {
    await writeDb(data);
  }

  return data;
}

export async function listEmployees() {
  return await readDb();
}

export async function getEmployeeById(id) {
  const arr = await readDb();
  return arr.find((x) => String(x.id) === String(id)) || null;
}

export async function createEmployee(body) {
  const arr = await readDb();

  const item = {
    id: makeId("emp"),
    name: (body?.name ?? body?.username ?? "").toString().trim() || "—",
    email: (body?.email ?? "").toString().trim() || "",
    company: (body?.company ?? body?.department ?? "").toString().trim() || "—",
    position: (body?.position ?? body?.role ?? "").toString().trim() || "—",
    trainings: Array.isArray(body?.trainings) ? body.trainings : [],
    updatedAt: nowIso(),
    createdAt: nowIso(),
  };

  arr.push(item);
  await writeDb(arr);
  return item;
}

export async function updateEmployee(id, body) {
  const arr = await readDb();
  const idx = arr.findIndex((x) => String(x.id) === String(id));
  if (idx === -1) return null;

  const prev = arr[idx];

  const next = {
    ...prev,
    name: (body?.name ?? prev.name),
    email: (body?.email ?? prev.email),
    company: (body?.company ?? prev.company),
    position: (body?.position ?? prev.position),
    trainings: Array.isArray(body?.trainings) ? body.trainings : (prev.trainings ?? []),
    updatedAt: nowIso(),
  };

  arr[idx] = next;
  await writeDb(arr);
  return next;
}

export async function deleteEmployee(id) {
  const arr = await readDb();
  const before = arr.length;
  const next = arr.filter((x) => String(x.id) !== String(id));
  if (next.length === before) return false;
  await writeDb(next);
  return true;
}

/**
 * ✅ Přidání školení zaměstnanci
 * body: { name, validFrom, validTo }
 */
export async function addTrainingToEmployee(employeeId, body) {
  const name = (body?.name ?? "").toString().trim();
  const validFrom = (body?.validFrom ?? "").toString().trim();
  const validTo = (body?.validTo ?? "").toString().trim();

  if (!name) throw new Error("Missing training name");
  if (!validFrom) throw new Error("Missing validFrom");
  if (!validTo) throw new Error("Missing validTo");

  const arr = await readDb();
  const idx = arr.findIndex((x) => String(x.id) === String(employeeId));
  if (idx === -1) return null;

  const emp = arr[idx];
  const trainings = Array.isArray(emp.trainings) ? emp.trainings : [];

  trainings.push({
    id: makeId("trn"),
    name,
    validFrom,
    validTo,
  });

  const updated = {
    ...emp,
    trainings,
    updatedAt: nowIso(),
  };

  arr[idx] = updated;
  await writeDb(arr);
  return updated;
}

/**
 * ✅ Smazání školení zaměstnanci
 * vrací updated employee nebo null (když employee neexistuje)
 * vrací false (když training neexistuje)
 */
export async function deleteTrainingFromEmployee(employeeId, trainingId) {
  const arr = await readDb();
  const idx = arr.findIndex((x) => String(x.id) === String(employeeId));
  if (idx === -1) return null;

  const emp = arr[idx];
  const trainings = Array.isArray(emp.trainings) ? emp.trainings : [];

  const before = trainings.length;
  const nextTrainings = trainings.filter((t) => String(t.id) !== String(trainingId));
  if (nextTrainings.length === before) return false;

  const updated = {
    ...emp,
    trainings: nextTrainings,
    updatedAt: nowIso(),
  };

  arr[idx] = updated;
  await writeDb(arr);
  return updated;
}

/**
 * ✅ Editace školení zaměstnanci
 * body: { name, validFrom, validTo }
 * vrací updated employee nebo null (když employee neexistuje)
 * vrací false (když training neexistuje)
 */
export async function updateTrainingInEmployee(employeeId, trainingId, body) {
  const name = (body?.name ?? "").toString().trim();
  const validFrom = (body?.validFrom ?? "").toString().trim();
  const validTo = (body?.validTo ?? "").toString().trim();

  if (!name) throw new Error("Missing training name");
  if (!validFrom) throw new Error("Missing validFrom");
  if (!validTo) throw new Error("Missing validTo");

  // jednoduchá validace dat (string YYYY-MM-DD funguje pro porovnání)
  if (validTo < validFrom) throw new Error("validTo must be >= validFrom");

  const arr = await readDb();
  const idx = arr.findIndex((x) => String(x.id) === String(employeeId));
  if (idx === -1) return null;

  const emp = arr[idx];
  const trainings = Array.isArray(emp.trainings) ? emp.trainings : [];

  const tIdx = trainings.findIndex((t) => String(t.id) === String(trainingId));
  if (tIdx === -1) return false;

  const prevT = trainings[tIdx];

  const nextT = {
    ...prevT,
    name,
    validFrom,
    validTo,
  };

  const nextTrainings = trainings.slice();
  nextTrainings[tIdx] = nextT;

  const updated = {
    ...emp,
    trainings: nextTrainings,
    updatedAt: nowIso(),
  };

  arr[idx] = updated;
  await writeDb(arr);
  return updated;
}
