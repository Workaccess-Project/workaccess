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
 * GET /api/employees
 */
router.get("/", async (req, res) => {
  const companyId = req.auth.companyId;
  const items = await listEmployees(companyId);
  res.json(items);
});

/**
 * GET /api/employees/:id
 */
router.get("/:id", async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;

  const item = await getEmployeeById(companyId, id);

  if (!item) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  res.json(item);
});

/**
 * POST /api/employees
 */
router.post("/", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;

  const created = await createEmployee(companyId, req.body);

  await auditLog({
    actorRole: req.role,
    action: "employee.create",
    entityType: "employee",
    entityId: created.id,
    meta: { employeeId: created.id },
    before: null,
    after: created,
  });

  res.status(201).json(created);
});

/**
 * PUT /api/employees/:id
 */
router.put("/:id", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;

  const before = await getEmployeeById(companyId, id);
  if (!before) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  const updated = await updateEmployee(companyId, id, req.body);

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
 * DELETE /api/employees/:id
 */
router.delete("/:id", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;

  const before = await getEmployeeById(companyId, id);
  if (!before) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  await deleteEmployee(companyId, id);

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
 * POST training
 */
router.post("/:id/trainings", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;
  const { name, validFrom, validTo } = req.body || {};

  if (!name || !validFrom || !validTo) {
    const err = new Error("Missing fields");
    err.status = 400;
    throw err;
  }

  const updated = await addTrainingToEmployee(companyId, id, {
    name,
    validFrom,
    validTo,
  });

  if (!updated) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  const createdTraining = updated.trainings.at(-1);

  await auditLog({
    actorRole: req.role,
    action: "training.create",
    entityType: "training",
    entityId: createdTraining.id,
    meta: { employeeId: id, trainingId: createdTraining.id },
    before: null,
    after: { employeeId: id, training: createdTraining },
  });

  res.status(201).json(createdTraining);
});

/**
 * DELETE training
 */
router.delete("/:id/trainings/:trainingId", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id, trainingId } = req.params;

  const result = await deleteTrainingFromEmployee(companyId, id, trainingId);

  if (result === null) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  if (result === false) {
    const err = new Error("Training not found");
    err.status = 404;
    throw err;
  }

  await auditLog({
    actorRole: req.role,
    action: "training.delete",
    entityType: "training",
    entityId: trainingId,
    meta: { employeeId: id, trainingId },
    before: null,
    after: null,
  });

  res.json({ ok: true });
});

/**
 * PUT training
 */
router.put("/:id/trainings/:trainingId", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id, trainingId } = req.params;
  const { name, validFrom, validTo } = req.body || {};

  if (!name || !validFrom || !validTo) {
    const err = new Error("Missing fields");
    err.status = 400;
    throw err;
  }

  const result = await updateTrainingInEmployee(companyId, id, trainingId, {
    name,
    validFrom,
    validTo,
  });

  if (result === null) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }

  if (result === false) {
    const err = new Error("Training not found");
    err.status = 404;
    throw err;
  }

  await auditLog({
    actorRole: req.role,
    action: "training.update",
    entityType: "training",
    entityId: trainingId,
    meta: { employeeId: id, trainingId },
  });

  res.json({ ok: true });
});

export default router;
