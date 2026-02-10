// backend/routes/employees.js
import express from "express";
import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  addTrainingToEmployee,
  deleteTrainingFromEmployee,
  updateTrainingInEmployee,
} from "../data-employees.js";

import { requireWrite } from "../auth.js";
import { auditLog } from "../data-audit.js";

const router = express.Router();

/**
 * GET /api/employees - list (READ pro všechny role)
 */
router.get("/", async (req, res) => {
  const items = await listEmployees();
  res.json(items);
});

/**
 * GET /api/employees/:id - detail (READ pro všechny role)
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const item = await getEmployeeById(id);

  if (!item) return res.status(404).json({ error: "Employee not found", id });
  res.json(item);
});

/**
 * POST /api/employees - create (WRITE: hr, manager)
 */
router.post("/", requireWrite, async (req, res) => {
  const created = await createEmployee(req.body);

  await auditLog({
    actorRole: req.role,
    action: "employee.create",
    entityType: "employee",
    entityId: created?.id ?? null,
    meta: { employeeId: created?.id ?? null },
    before: null,
    after: created,
  });

  res.status(201).json(created);
});

/**
 * PUT /api/employees/:id - update (WRITE: hr, manager)
 */
router.put("/:id", requireWrite, async (req, res) => {
  const { id } = req.params;

  const before = await getEmployeeById(id);
  if (!before) return res.status(404).json({ error: "Employee not found", id });

  const updated = await updateEmployee(id, req.body);
  if (!updated) return res.status(404).json({ error: "Employee not found", id });

  await auditLog({
    actorRole: req.role,
    action: "employee.update",
    entityType: "employee",
    entityId: id,
    meta: { employeeId: id },
    before,
    after: updated,
  });

  res.json(updated);
});

/**
 * DELETE /api/employees/:id - delete (WRITE: hr, manager)
 */
router.delete("/:id", requireWrite, async (req, res) => {
  const { id } = req.params;

  const before = await getEmployeeById(id);
  if (!before) return res.status(404).json({ error: "Employee not found", id });

  const ok = await deleteEmployee(id);
  if (!ok) return res.status(404).json({ error: "Employee not found", id });

  await auditLog({
    actorRole: req.role,
    action: "employee.delete",
    entityType: "employee",
    entityId: id,
    meta: { employeeId: id },
    before,
    after: null,
  });

  res.json({ ok: true });
});

/**
 * POST /api/employees/:id/trainings - add training (WRITE: hr, manager)
 * Body: { name, validFrom, validTo }
 */
router.post("/:id/trainings", requireWrite, async (req, res) => {
  const { id } = req.params;

  const { name, validFrom, validTo } = req.body || {};
  if (!name || !validFrom || !validTo) {
    return res.status(400).json({
      error: "Missing fields",
      required: ["name", "validFrom", "validTo"],
    });
  }

  const empBefore = await getEmployeeById(id);
  if (!empBefore) return res.status(404).json({ error: "Employee not found", id });

  try {
    // ✅ sjednoceno: tvorba trainingu je v data layer (generuje trn_... id)
    const updatedEmp = await addTrainingToEmployee(id, { name, validFrom, validTo });
    if (!updatedEmp) return res.status(404).json({ error: "Employee not found", id });

    const trainings = Array.isArray(updatedEmp.trainings) ? updatedEmp.trainings : [];
    const createdTraining = trainings.length ? trainings[trainings.length - 1] : null;

    await auditLog({
      actorRole: req.role,
      action: "training.create",
      entityType: "training",
      entityId: createdTraining?.id ?? null,
      meta: { employeeId: id, trainingId: createdTraining?.id ?? null },
      before: null,
      after: { employeeId: id, training: createdTraining },
    });

    // zachováme původní chování FE: vracíme training objekt
    res.status(201).json(createdTraining || { ok: true });
  } catch (err) {
    return res.status(400).json({ error: err?.message || String(err) });
  }
});

/**
 * DELETE /api/employees/:id/trainings/:trainingId - delete training (WRITE: hr, manager)
 */
router.delete("/:id/trainings/:trainingId", requireWrite, async (req, res) => {
  const { id, trainingId } = req.params;

  const empBefore = await getEmployeeById(id);
  if (!empBefore) return res.status(404).json({ error: "Employee not found", id });

  const beforeTraining =
    (Array.isArray(empBefore.trainings) ? empBefore.trainings : []).find(
      (t) => String(t?.id) === String(trainingId)
    ) || null;

  const result = await deleteTrainingFromEmployee(id, trainingId);

  if (result === null) {
    return res.status(404).json({ error: "Employee not found", id });
  }
  if (result === false) {
    return res.status(404).json({ error: "Training not found", trainingId });
  }

  await auditLog({
    actorRole: req.role,
    action: "training.delete",
    entityType: "training",
    entityId: trainingId,
    meta: { employeeId: id, trainingId },
    before: { employeeId: id, training: beforeTraining },
    after: null,
  });

  res.json({ ok: true });
});

/**
 * PUT /api/employees/:id/trainings/:trainingId - edit training (WRITE: hr, manager)
 * Body: { name, validFrom, validTo }
 */
router.put("/:id/trainings/:trainingId", requireWrite, async (req, res) => {
  const { id, trainingId } = req.params;

  const { name, validFrom, validTo } = req.body || {};
  if (!name || !validFrom || !validTo) {
    return res.status(400).json({
      error: "Missing fields",
      required: ["name", "validFrom", "validTo"],
    });
  }

  const empBefore = await getEmployeeById(id);
  if (!empBefore) return res.status(404).json({ error: "Employee not found", id });

  const beforeTraining =
    (Array.isArray(empBefore.trainings) ? empBefore.trainings : []).find(
      (t) => String(t?.id) === String(trainingId)
    ) || null;

  try {
    const result = await updateTrainingInEmployee(id, trainingId, { name, validFrom, validTo });

    if (result === null) {
      return res.status(404).json({ error: "Employee not found", id });
    }
    if (result === false) {
      return res.status(404).json({ error: "Training not found", trainingId });
    }

    const empAfter = await getEmployeeById(id);
    const afterTraining =
      (Array.isArray(empAfter?.trainings) ? empAfter.trainings : []).find(
        (t) => String(t?.id) === String(trainingId)
      ) || null;

    await auditLog({
      actorRole: req.role,
      action: "training.update",
      entityType: "training",
      entityId: trainingId,
      meta: { employeeId: id, trainingId },
      before: { employeeId: id, training: beforeTraining },
      after: { employeeId: id, training: afterTraining },
    });

    res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err?.message || String(err) });
  }
});

export default router;
