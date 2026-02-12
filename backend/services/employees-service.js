// backend/services/employees-service.js
import {
  listEmployees as dataListEmployees,
  getEmployeeById as dataGetEmployeeById,
  createEmployee as dataCreateEmployee,
  updateEmployee as dataUpdateEmployee,
  deleteEmployee as dataDeleteEmployee,
  addTrainingToEmployee as dataAddTrainingToEmployee,
  deleteTrainingFromEmployee as dataDeleteTrainingFromEmployee,
  updateTrainingInEmployee as dataUpdateTrainingInEmployee,
} from "../data-employees.js";

import { auditLog } from "../data-audit.js";

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// --- READ ---
export async function listEmployees() {
  const items = await dataListEmployees();
  return Array.isArray(items) ? items : [];
}

export async function getEmployeeById(id) {
  const item = await dataGetEmployeeById(id);
  return item || null;
}

// --- WRITE ---
export async function createEmployee({ actorRole, body }) {
  const created = await dataCreateEmployee(body);

  await auditLog({
    actorRole,
    action: "employee.create",
    entityType: "employee",
    entityId: created?.id ?? null,
    meta: { employeeId: created?.id ?? null },
    before: null,
    after: created,
  });

  return created;
}

export async function updateEmployee({ actorRole, id, body }) {
  const before = await dataGetEmployeeById(id);
  if (!before) throw err(404, "Employee not found");

  const updated = await dataUpdateEmployee(id, body);
  if (!updated) throw err(404, "Employee not found");

  await auditLog({
    actorRole,
    action: "employee.update",
    entityType: "employee",
    entityId: String(id),
    meta: { employeeId: String(id) },
    before,
    after: updated,
  });

  return updated;
}

export async function deleteEmployee({ actorRole, id }) {
  const before = await dataGetEmployeeById(id);
  if (!before) throw err(404, "Employee not found");

  const ok = await dataDeleteEmployee(id);
  if (!ok) throw err(404, "Employee not found");

  await auditLog({
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
    const e = err(400, "Missing fields");
    e.payload = { required: ["name", "validFrom", "validTo"] };
    throw e;
  }
  return { name, validFrom, validTo };
}

/**
 * Přidat školení: zachováme FE chování -> vrací training objekt
 */
export async function addTraining({ actorRole, employeeId, body }) {
  const { name, validFrom, validTo } = requireTrainingFields(body);

  const empBefore = await dataGetEmployeeById(employeeId);
  if (!empBefore) throw err(404, "Employee not found");

  let updatedEmp;
  try {
    updatedEmp = await dataAddTrainingToEmployee(employeeId, { name, validFrom, validTo });
  } catch (e) {
    throw err(400, e?.message || String(e));
  }

  if (!updatedEmp) throw err(404, "Employee not found");

  const trainings = Array.isArray(updatedEmp.trainings) ? updatedEmp.trainings : [];
  const createdTraining = trainings.length ? trainings[trainings.length - 1] : null;

  await auditLog({
    actorRole,
    action: "training.create",
    entityType: "training",
    entityId: createdTraining?.id ?? null,
    meta: { employeeId: String(employeeId), trainingId: createdTraining?.id ?? null },
    before: null,
    after: { employeeId: String(employeeId), training: createdTraining },
  });

  return createdTraining || { ok: true };
}

export async function deleteTraining({ actorRole, employeeId, trainingId }) {
  const empBefore = await dataGetEmployeeById(employeeId);
  if (!empBefore) throw err(404, "Employee not found");

  const beforeTraining =
    (Array.isArray(empBefore.trainings) ? empBefore.trainings : []).find(
      (t) => String(t?.id) === String(trainingId)
    ) || null;

  const result = await dataDeleteTrainingFromEmployee(employeeId, trainingId);

  if (result === null) throw err(404, "Employee not found");
  if (result === false) throw err(404, "Training not found");

  await auditLog({
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

export async function updateTraining({ actorRole, employeeId, trainingId, body }) {
  const { name, validFrom, validTo } = requireTrainingFields(body);

  const empBefore = await dataGetEmployeeById(employeeId);
  if (!empBefore) throw err(404, "Employee not found");

  const beforeTraining =
    (Array.isArray(empBefore.trainings) ? empBefore.trainings : []).find(
      (t) => String(t?.id) === String(trainingId)
    ) || null;

  let result;
  try {
    result = await dataUpdateTrainingInEmployee(employeeId, trainingId, { name, validFrom, validTo });
  } catch (e) {
    throw err(400, e?.message || String(e));
  }

  if (result === null) throw err(404, "Employee not found");
  if (result === false) throw err(404, "Training not found");

  const empAfter = await dataGetEmployeeById(employeeId);
  const afterTraining =
    (Array.isArray(empAfter?.trainings) ? empAfter.trainings : []).find(
      (t) => String(t?.id) === String(trainingId)
    ) || null;

  await auditLog({
    actorRole,
    action: "training.update",
    entityType: "training",
    entityId: String(trainingId),
    meta: { employeeId: String(employeeId), trainingId: String(trainingId) },
    before: { employeeId: String(employeeId), training: beforeTraining },
    after: { employeeId: String(employeeId), training: afterTraining },
  });

  return { ok: true };
}
