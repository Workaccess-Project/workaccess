// backend/routes/employees.js
import express from "express";
import { requireWrite } from "../auth.js";
import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  addTraining,
  deleteTraining,
  updateTraining,
} from "../services/employees-service.js";

const router = express.Router();

/**
 * SAFE ASYNC WRAPPER
 * Ensures async route errors are passed to Express errorHandler (next(err)),
 * so server never crashes on thrown errors (e.g. 402 billing/user-limit).
 */
function asyncWrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * GET /api/employees
 * READ pro všechny role
 */
router.get(
  "/",
  asyncWrap(async (req, res) => {
    const companyId = req.auth.companyId;
    const items = await listEmployees({ companyId });
    res.json(items);
  })
);

/**
 * GET /api/employees/:id
 */
router.get(
  "/:id",
  asyncWrap(async (req, res) => {
    const companyId = req.auth.companyId;
    const { id } = req.params;

    const item = await getEmployeeById({ companyId, id });
    if (!item) {
      const err = new Error("Employee not found");
      err.status = 404;
      throw err;
    }

    res.json(item);
  })
);

/**
 * POST /api/employees
 */
router.post(
  "/",
  requireWrite,
  asyncWrap(async (req, res) => {
    const companyId = req.auth.companyId;

    const created = await createEmployee({
      companyId,
      actorRole: req.role,
      body: req.body,
    });

    res.status(201).json(created);
  })
);

/**
 * PUT /api/employees/:id
 */
router.put(
  "/:id",
  requireWrite,
  asyncWrap(async (req, res) => {
    const companyId = req.auth.companyId;
    const { id } = req.params;

    const updated = await updateEmployee({
      companyId,
      actorRole: req.role,
      id,
      body: req.body,
    });

    res.json(updated);
  })
);

/**
 * DELETE /api/employees/:id
 */
router.delete(
  "/:id",
  requireWrite,
  asyncWrap(async (req, res) => {
    const companyId = req.auth.companyId;
    const { id } = req.params;

    await deleteEmployee({
      companyId,
      actorRole: req.role,
      id,
    });

    res.json({ ok: true });
  })
);

/**
 * POST /api/employees/:id/trainings
 * vrací created training objekt (kompatibilní s FE)
 */
router.post(
  "/:id/trainings",
  requireWrite,
  asyncWrap(async (req, res) => {
    const companyId = req.auth.companyId;
    const { id } = req.params;

    const createdTraining = await addTraining({
      companyId,
      actorRole: req.role,
      employeeId: id,
      body: req.body,
    });

    res.status(201).json(createdTraining);
  })
);

/**
 * DELETE /api/employees/:id/trainings/:trainingId
 */
router.delete(
  "/:id/trainings/:trainingId",
  requireWrite,
  asyncWrap(async (req, res) => {
    const companyId = req.auth.companyId;
    const { id, trainingId } = req.params;

    const result = await deleteTraining({
      companyId,
      actorRole: req.role,
      employeeId: id,
      trainingId,
    });

    res.json(result);
  })
);

/**
 * PUT /api/employees/:id/trainings/:trainingId
 */
router.put(
  "/:id/trainings/:trainingId",
  requireWrite,
  asyncWrap(async (req, res) => {
    const companyId = req.auth.companyId;
    const { id, trainingId } = req.params;

    const result = await updateTraining({
      companyId,
      actorRole: req.role,
      employeeId: id,
      trainingId,
      body: req.body,
    });

    res.json(result);
  })
);

export default router;
