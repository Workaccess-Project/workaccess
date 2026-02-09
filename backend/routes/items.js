// backend/routes/items.js
import express from "express";
import { readData, writeData } from "../data.js";
import { auditLog } from "../data-audit.js";

const router = express.Router();

// helper: porovnání id robustně (string vs number)
function sameId(a, b) {
  return String(a) === String(b);
}

// GET /api/items
router.get("/", (req, res) => {
  const items = readData();
  res.json(items);
});

// POST /api/items  { text }
router.post("/", async (req, res) => {
  const items = readData();

  const text = (req.body?.text ?? "").toString().trim();
  if (!text) {
    return res.status(400).json({ error: "Text je povinný" });
  }

  const newItem = {
    id: Date.now().toString(),
    text,
    done: false,
  };

  items.push(newItem);
  writeData(items);

  await auditLog({
    actorRole: req.role,
    action: "item.create",
    entityType: "item",
    entityId: newItem.id,
    meta: {},
    before: null,
    after: newItem,
  });

  res.status(201).json(newItem);
});

// PATCH /api/items/:id  (toggle done)
router.patch("/:id", async (req, res) => {
  const items = readData();
  const { id } = req.params;

  const idx = items.findIndex((it) => sameId(it.id, id));
  if (idx === -1) {
    return res.status(404).json({ error: "Položka nenalezena" });
  }

  const before = { ...items[idx] };

  items[idx].done = !items[idx].done;
  writeData(items);

  await auditLog({
    actorRole: req.role,
    action: "item.toggle",
    entityType: "item",
    entityId: id,
    meta: {},
    before,
    after: items[idx],
  });

  res.json(items[idx]);
});

// PATCH /api/items/:id/text  { text }  (update text)
router.patch("/:id/text", async (req, res) => {
  const items = readData();
  const { id } = req.params;

  const text = (req.body?.text ?? "").toString().trim();
  if (!text) {
    return res.status(400).json({ error: "Text je povinný" });
  }

  const idx = items.findIndex((it) => sameId(it.id, id));
  if (idx === -1) {
    return res.status(404).json({ error: "Položka nenalezena" });
  }

  const before = { ...items[idx] };

  items[idx].text = text;
  writeData(items);

  await auditLog({
    actorRole: req.role,
    action: "item.updateText",
    entityType: "item",
    entityId: id,
    meta: {},
    before,
    after: items[idx],
  });

  res.json(items[idx]);
});

// DELETE /api/items/:id
router.delete("/:id", async (req, res) => {
  const items = readData();
  const { id } = req.params;

  const before = items.find((it) => sameId(it.id, id)) || null;

  const next = items.filter((it) => !sameId(it.id, id));
  if (next.length === items.length) {
    return res.status(404).json({ error: "Položka nenalezena" });
  }

  writeData(next);

  await auditLog({
    actorRole: req.role,
    action: "item.delete",
    entityType: "item",
    entityId: id,
    meta: {},
    before,
    after: null,
  });

  res.json({ ok: true });
});

// DELETE /api/items  (smazat hotové)
router.delete("/", async (req, res) => {
  const items = readData();
  const doneItems = items.filter((it) => !!it.done);

  const next = items.filter((it) => !it.done);
  writeData(next);

  await auditLog({
    actorRole: req.role,
    action: "item.deleteDone",
    entityType: "item",
    entityId: null,
    meta: { deleted: doneItems.length },
    before: doneItems,
    after: null,
  });

  res.json({ ok: true, deleted: items.length - next.length });
});

export default router;
