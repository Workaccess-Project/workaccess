// backend/routes/employees.js
import express from "express";
import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  deleteTrainingFromEmployee,
  updateTrainingInEmployee,
} from "../data-employees.js";

import { requireWrite } from "../auth.js";

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
  res.status(201).json(created);
});

/**
 * PUT /api/employees/:id - update (WRITE: hr, manager)
 */
router.put("/:id", requireWrite, async (req, res) => {
  const { id } = req.params;
  const updated = await updateEmployee(id, req.body);

  if (!updated) return res.status(404).json({ error: "Employee not found", id });
  res.json(updated);
});

/**
 * DELETE /api/employees/:id - delete (WRITE: hr, manager)
 */
router.delete("/:id", requireWrite, async (req, res) => {
  const { id } = req.params;
  const ok = await deleteEmployee(id);

  if (!ok) return res.status(404).json({ error: "Employee not found", id });
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

  const emp = await getEmployeeById(id);
  if (!emp) return res.status(404).json({ error: "Employee not found", id });

  const training = {
    id: `tr_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: String(name),
    validFrom: String(validFrom),
    validTo: String(validTo),
  };

  const next = {
    ...emp,
    trainings: Array.isArray(emp.trainings) ? [...emp.trainings, training] : [training],
    updatedAt: new Date().toISOString(),
  };

  const saved = await updateEmployee(id, next);
  if (!saved) return res.status(500).json({ error: "Failed to save training" });

  res.status(201).json(training);
});

/**
 * DELETE /api/employees/:id/trainings/:trainingId - delete training (WRITE: hr, manager)
 */
router.delete("/:id/trainings/:trainingId", requireWrite, async (req, res) => {
  const { id, trainingId } = req.params;

  const result = await deleteTrainingFromEmployee(id, trainingId);

  if (result === null) {
    return res.status(404).json({ error: "Employee not found", id });
  }
  if (result === false) {
    return res.status(404).json({ error: "Training not found", trainingId });
  }

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

  try {
    const result = await updateTrainingInEmployee(id, trainingId, { name, validFrom, validTo });

    if (result === null) {
      return res.status(404).json({ error: "Employee not found", id });
    }
    if (result === false) {
      return res.status(404).json({ error: "Training not found", trainingId });
    }

    res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err?.message || String(err) });
  }
});

export default router;
