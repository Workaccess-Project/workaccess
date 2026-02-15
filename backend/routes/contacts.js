// backend/routes/contacts.js
import express from "express";
import { requireWrite } from "../auth.js";
import {
  listContactsService,
  getContactByIdService,
  createContactService,
  updateContactService,
  deleteContactService,
} from "../services/contacts-service.js";

const router = express.Router();

/**
 * GET /api/contacts
 * READ for all roles
 */
router.get("/", async (req, res) => {
  const companyId = req.auth.companyId;
  const items = await listContactsService({ companyId });
  res.json(items);
});

/**
 * GET /api/contacts/:id
 */
router.get("/:id", async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;
  const item = await getContactByIdService({ companyId, id });
  res.json(item);
});

/**
 * POST /api/contacts
 * WRITE: hr/manager
 */
router.post("/", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;

  const created = await createContactService({
    companyId,
    actorRole: req.role,
    body: req.body,
  });

  res.status(201).json(created);
});

/**
 * PUT /api/contacts/:id
 */
router.put("/:id", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;

  const updated = await updateContactService({
    companyId,
    actorRole: req.role,
    id,
    body: req.body,
  });

  res.json(updated);
});

/**
 * DELETE /api/contacts/:id
 */
router.delete("/:id", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;

  const result = await deleteContactService({
    companyId,
    actorRole: req.role,
    id,
  });

  res.json(result);
});

export default router;
