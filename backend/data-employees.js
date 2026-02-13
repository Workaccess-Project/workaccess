// backend/data-employees.js
import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "emp") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

async function writeDb(companyId, arr) {
  await writeTenantEntity(companyId, "employees", arr);
}

async function readDb(companyId) {
  const data = await readTenantEntity(companyId, "employees");
  if (!Array.isArray(data)) throw new Error("employees.json must be an array");

  // ✅ AUTO-MIGRACE: doplní id starým školením (když chybí) a jednou uloží do JSON
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
    await writeDb(companyId, data);
  }

  return data;
}

export async function listEmployees(companyId) {
  return await readDb(companyId);
}

export async function getEmployeeById(companyId, id) {
  const arr = await readDb(companyId);
  return arr.find((x) => String(x.id) === String(id)) || null;
}

export async function createEmployee(companyId, body) {
  const arr = await readDb(companyId);

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
  await writeDb(companyId, arr);
  return item;
}

export async function updateEmployee(companyId, id, body) {
  const arr = await readDb(companyId);
  const idx = arr.findIndex((x) => String(x.id) === String(id));
  if (idx === -1) return null;

  const prev = arr[idx];

  const next = {
    ...prev,
    name: body?.name ?? prev.name,
    email: body?.email ?? prev.email,
    company: body?.company ?? prev.company,
    position: body?.position ?? prev.position,
    trainings: Array.isArray(body?.trainings) ? body.trainings : prev.trainings ?? [],
    updatedAt: nowIso(),
  };

  arr[idx] = next;
  await writeDb(companyId, arr);
  return next;
}

export async function deleteEmployee(companyId, id) {
  const arr = await readDb(companyId);
  const before = arr.length;
  const next = arr.filter((x) => String(x.id) !== String(id));
  if (next.length === before) return false;
  await writeDb(companyId, next);
  return true;
}

// --- TRAININGS ---
export async function addTrainingToEmployee(companyId, employeeId, body) {
  const name = (body?.name ?? "").toString().trim();
  const validFrom = (body?.validFrom ?? "").toString().trim();
  const validTo = (body?.validTo ?? "").toString().trim();

  if (!name) throw new Error("Missing training name");
  if (!validFrom) throw new Error("Missing validFrom");
  if (!validTo) throw new Error("Missing validTo");

  const arr = await readDb(companyId);
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
  await writeDb(companyId, arr);
  return updated;
}

export async function deleteTrainingFromEmployee(companyId, employeeId, trainingId) {
  const arr = await readDb(companyId);
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
  await writeDb(companyId, arr);
  return updated;
}

export async function updateTrainingInEmployee(companyId, employeeId, trainingId, body) {
  const name = (body?.name ?? "").toString().trim();
  const validFrom = (body?.validFrom ?? "").toString().trim();
  const validTo = (body?.validTo ?? "").toString().trim();

  if (!name) throw new Error("Missing training name");
  if (!validFrom) throw new Error("Missing validFrom");
  if (!validTo) throw new Error("Missing validTo");
  if (validTo < validFrom) throw new Error("validTo must be >= validFrom");

  const arr = await readDb(companyId);
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
  await writeDb(companyId, arr);
  return updated;
}
