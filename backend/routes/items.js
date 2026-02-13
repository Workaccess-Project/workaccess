// backend/routes/items.js

import express from "express";
import { auditLog } from "../data-audit.js";
import { requireWrite } from "../auth.js";
import {
  readTenantEntity,
  writeTenantEntity,
} from "../data/tenant-store.js";

const router = express.Router();

const ENTITY = "items";

function sameId(a, b) {
  return String(a) === String(b);
}

/**
 * GET /api/items
 */
router.get("/", async (req, res) => {
  const companyId = req.auth.companyId;
  const items = await readTenantEntity(companyId, ENTITY);
  res.json(items);
});

/**
 * POST /api/items
 */
router.post("/", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const text = (req.body?.text ?? "").toString().trim();

  if (!text) {
    const err = new Error("Text je povinný");
    err.status = 400;
    throw err;
  }

  const items = await readTenantEntity(companyId, ENTITY);

  const newItem = {
    id: Date.now().toString(),
    text,
    done: false,
  };

  items.push(newItem);
  await writeTenantEntity(companyId, ENTITY, items);

  await auditLog({
    actorRole: req.role,
    action: "item.create",
    entityType: "item",
    entityId: newItem.id,
    before: null,
    after: newItem,
  });

  res.status(201).json(newItem);
});

/**
 * PATCH /api/items/:id (toggle)
 */
router.patch("/:id", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;

  const items = await readTenantEntity(companyId, ENTITY);

  const idx = items.findIndex((it) => sameId(it.id, id));
  if (idx === -1) {
    const err = new Error("Položka nenalezena");
    err.status = 404;
    throw err;
  }

  const before = { ...items[idx] };

  items[idx].done = !items[idx].done;
  await writeTenantEntity(companyId, ENTITY, items);

  await auditLog({
    actorRole: req.role,
    action: "item.toggle",
    entityType: "item",
    entityId: id,
    before,
    after: items[idx],
  });

  res.json(items[idx]);
});

/**
 * DELETE /api/items/:id
 */
router.delete("/:id", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;
  const { id } = req.params;

  const items = await readTenantEntity(companyId, ENTITY);

  const before = items.find((it) => sameId(it.id, id));
  if (!before) {
    const err = new Error("Položka nenalezena");
    err.status = 404;
    throw err;
  }

  const next = items.filter((it) => !sameId(it.id, id));
  await writeTenantEntity(companyId, ENTITY, next);

  await auditLog({
    actorRole: req.role,
    action: "item.delete",
    entityType: "item",
    entityId: id,
    before,
    after: null,
  });

  res.json({ ok: true });
});

export default router;
