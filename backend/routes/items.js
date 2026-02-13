// backend/routes/items.js
import express from "express";
import { requireWrite } from "../auth.js";
import {
  listItems,
  createItem,
  toggleItemDone,
  updateItemText,
  deleteItemById,
  deleteDoneItems,
} from "../services/items-service.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const companyId = req.auth.companyId;
  const items = await listItems({ companyId });
  res.json(items);
});

router.post("/", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const created = await createItem({
    companyId,
    actorRole: req.role,
    text: req.body?.text,
  });
  res.status(201).json(created);
});

router.patch("/:id", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const updated = await toggleItemDone({
    companyId,
    actorRole: req.role,
    id: req.params.id,
  });
  res.json(updated);
});

router.patch("/:id/text", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const updated = await updateItemText({
    companyId,
    actorRole: req.role,
    id: req.params.id,
    text: req.body?.text,
  });
  res.json(updated);
});

router.delete("/:id", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const result = await deleteItemById({
    companyId,
    actorRole: req.role,
    id: req.params.id,
  });
  res.json(result);
});

router.delete("/", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const result = await deleteDoneItems({
    companyId,
    actorRole: req.role,
  });
  res.json(result);
});

export default router;
