// backend/routes/employees.js
import express from "express";
import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../data-employees.js";

const router = express.Router();

/**
 * GET /api/employees
 * - list
 */
router.get("/", async (req, res) => {
  const items = await listEmployees();
  res.json(items);
});

/**
 * GET /api/employees/:id
 * - detail (read-only)
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const item = await getEmployeeById(id);

  if (!item) {
    return res.status(404).json({ error: "Employee not found", id });
  }

  res.json(item);
});

/**
 * POST /api/employees
 * - create
 */
router.post("/", async (req, res) => {
  const created = await createEmployee(req.body);
  res.status(201).json(created);
});

/**
 * PUT /api/employees/:id
 * - update
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const updated = await updateEmployee(id, req.body);

  if (!updated) {
    return res.status(404).json({ error: "Employee not found", id });
  }

  res.json(updated);
});

/**
 * DELETE /api/employees/:id
 * - delete
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const ok = await deleteEmployee(id);

  if (!ok) {
    return res.status(404).json({ error: "Employee not found", id });
  }

  res.json({ ok: true });
});

export default router;
