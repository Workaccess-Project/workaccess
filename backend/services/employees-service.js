// backend/services/employees-service.js
import { readTenantEntity, writeTenantEntity } from "../data/tenant-store.js";
import { auditLog } from "../data-audit.js";

const ENTITY = "employees";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "emp") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function requireCompanyId(companyId) {
  const c = (companyId ?? "").toString().trim();
  if (!c) {
    const err = new Error("Missing companyId (tenant context).");
    err.status = 400;
    throw err;
  }
  return c;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeEmployeeBody(body = {}) {
  return {
    name: (body?.name ?? body?.username ?? "").toString().trim() || "—",
    email: (body?.email ?? "").toString().trim() || "",
    company: (body?.company ?? body?.department ?? "").toString().trim() || "—",
    position: (body?.position ?? body?.role ?? "").toString().trim() || "—",
  };
}

function ensureTrainingIds(employees) {
  let changed = false;

  for (const emp of employees) {
    const trainings = asArray(emp?.trainings);
    for (const t of trainings) {
      if (!t.id) {
        t.id = makeId("trn");
        changed = true;
      }
      if (t.name != null) t.name = String(t.name);
      if (t.validFrom != null) t.validFrom = String(t.validFrom);
      if (t.validTo != null) t.validTo = String(t.validTo);
    }
    if (emp.trainings !== trainings) {
      emp.trainings = trainings;
      changed = true;
    }
  }

  return { changed, employees };
}

async function readEmployees(companyId) {
  const cid = requireCompanyId(companyId);
  const arr = await readTenantEntity(cid, ENTITY);
  const employees = asArray(arr);

  const { changed } = ensureTrainingIds(employees);
  if (changed) await writeTenantEntity(cid, ENTITY, employees);

  return employees;
}

async function writeEmployees(companyId, employees) {
  const cid = requireCompanyId(companyId);
  await writeTenantEntity(cid, ENTITY, employees);
}

function findById(arr, id) {
  return arr.find((x) => String(x.id) === String(id)) || null;
}

// --- API ---

export async function listEmployees({ companyId }) {
  return await readEmployees(companyId);
}

export async function getEmployeeById({ companyId, id }) {
  const employees = await readEmployees(companyId);
  return findById(employees, id);
}

export async function createEmployee({ companyId, actorRole, body }) {
  const employees = await readEmployees(companyId);
  const base = normalizeEmployeeBody(body);

  const item = {
    id: makeId("emp"),
    ...base,
    trainings: [],
    updatedAt: nowIso(),
    createdAt: nowIso(),
  };

  employees.push(item);
  await writeEmployees(companyId, employees);

  await auditLog({
    companyId,
    actorRole,
    action: "employee.create",
    entityType: "employee",
    entityId: String(item.id),
    meta: { employeeId: String(item.id) },
    before: null,
    after: item,
  });

  return item;
}

export async function updateEmployee({ companyId, actorRole, id, body }) {
  const employees = await readEmployees(companyId);
  const idx = employees.findIndex((x) => String(x.id) === String(id));
  if (idx === -1) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  const before = { ...employees[idx] };
  const patch = normalizeEmployeeBody({ ...before, ...body });

  const next = {
    ...employees[idx],
    ...patch,
    trainings: asArray(body?.trainings) ? body.trainings : asArray(employees[idx].trainings),
    updatedAt: nowIso(),
  };

  employees[idx] = next;
  await writeEmployees(companyId, employees);

  await auditLog({
    companyId,
    actorRole,
    action: "employee.update",
    entityType: "employee",
    entityId: String(id),
    meta: { employeeId: String(id) },
    before,
    after: next,
  });

  return next;
}

export async function deleteEmployee({ companyId, actorRole, id }) {
  const employees = await readEmployees(companyId);
  const before = findById(employees, id);
  if (!before) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  const next = employees.filter((x) => String(x.id) !== String(id));
  await writeEmployees(companyId, next);

  await auditLog({
    companyId,
    actorRole,
    action: "employee.delete",
    entityType: "employee",
    entityId: String(id),
    meta: { employeeId: String(id) },
    before,
    after: null,
  });

  return { ok: true };
}

// --- TRAININGS ---

function requireTrainingFields(body) {
  const { name, validFrom, validTo } = body || {};
  if (!name || !validFrom || !validTo) {
    const e = new Error("Missing fields");
    e.status = 400;
    e.payload = { required: ["name", "validFrom", "validTo"] };
    throw e;
  }
  if (String(validTo) < String(validFrom)) {
    const e = new Error("validTo must be >= validFrom");
    e.status = 400;
    throw e;
  }
  return { name: String(name).trim(), validFrom: String(validFrom).trim(), validTo: String(validTo).trim() };
}

export async function addTraining({ companyId, actorRole, employeeId, body }) {
  const { name, validFrom, validTo } = requireTrainingFields(body);

  const employees = await readEmployees(companyId);
  const idx = employees.findIndex((x) => String(x.id) === String(employeeId));
  if (idx === -1) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  const empBefore = { ...employees[idx] };
  const trainings = asArray(employees[idx].trainings);

  const createdTraining = { id: makeId("trn"), name, validFrom, validTo };
  trainings.push(createdTraining);

  const updatedEmp = { ...employees[idx], trainings, updatedAt: nowIso() };
  employees[idx] = updatedEmp;
  await writeEmployees(companyId, employees);

  await auditLog({
    companyId,
    actorRole,
    action: "training.create",
    entityType: "training",
    entityId: String(createdTraining.id),
    meta: { employeeId: String(employeeId), trainingId: String(createdTraining.id) },
    before: null,
    after: { employeeId: String(employeeId), training: createdTraining },
  });

  return createdTraining;
}

export async function deleteTraining({ companyId, actorRole, employeeId, trainingId }) {
  const employees = await readEmployees(companyId);
  const idx = employees.findIndex((x) => String(x.id) === String(employeeId));
  if (idx === -1) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  const trainings = asArray(employees[idx].trainings);
  const beforeTraining = trainings.find((t) => String(t.id) === String(trainingId)) || null;

  const nextTrainings = trainings.filter((t) => String(t.id) !== String(trainingId));
  if (nextTrainings.length === trainings.length) {
    const err = new Error("Training not found");
    err.status = 404;
    throw err;
  }

  const updatedEmp = { ...employees[idx], trainings: nextTrainings, updatedAt: nowIso() };
  employees[idx] = updatedEmp;
  await writeEmployees(companyId, employees);

  await auditLog({
    companyId,
    actorRole,
    action: "training.delete",
    entityType: "training",
    entityId: String(trainingId),
    meta: { employeeId: String(employeeId), trainingId: String(trainingId) },
    before: { employeeId: String(employeeId), training: beforeTraining },
    after: null,
  });

  return { ok: true };
}

export async function updateTraining({ companyId, actorRole, employeeId, trainingId, body }) {
  const { name, validFrom, validTo } = requireTrainingFields(body);

  const employees = await readEmployees(companyId);
  const idx = employees.findIndex((x) => String(x.id) === String(employeeId));
  if (idx === -1) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  const trainings = asArray(employees[idx].trainings);
  const tIdx = trainings.findIndex((t) => String(t.id) === String(trainingId));
  if (tIdx === -1) {
    const err = new Error("Training not found");
    err.status = 404;
    throw err;
  }

  const beforeTraining = { ...trainings[tIdx] };

  const nextTrainings = trainings.slice();
  nextTrainings[tIdx] = { ...beforeTraining, name, validFrom, validTo };

  const updatedEmp = { ...employees[idx], trainings: nextTrainings, updatedAt: nowIso() };
  employees[idx] = updatedEmp;
  await writeEmployees(companyId, employees);

  await auditLog({
    companyId,
    actorRole,
    action: "training.update",
    entityType: "training",
    entityId: String(trainingId),
    meta: { employeeId: String(employeeId), trainingId: String(trainingId) },
    before: { employeeId: String(employeeId), training: beforeTraining },
    after: { employeeId: String(employeeId), training: nextTrainings[tIdx] },
  });

  return { ok: true };
}
