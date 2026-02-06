import express from "express";
import { readData, writeData } from "../data.js";

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
router.post("/", (req, res) => {
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

  res.status(201).json(newItem);
});

// PATCH /api/items/:id  (toggle done)
router.patch("/:id", (req, res) => {
  const items = readData();
  const { id } = req.params;

  const idx = items.findIndex((it) => sameId(it.id, id));
  if (idx === -1) {
    return res.status(404).json({ error: "Položka nenalezena" });
  }

  items[idx].done = !items[idx].done;
  writeData(items);

  res.json(items[idx]);
});

// PATCH /api/items/:id/text  { text }  (update text)
router.patch("/:id/text", (req, res) => {
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

  items[idx].text = text;
  writeData(items);

  res.json(items[idx]);
});

// DELETE /api/items/:id
router.delete("/:id", (req, res) => {
  const items = readData();
  const { id } = req.params;

  const next = items.filter((it) => !sameId(it.id, id));
  if (next.length === items.length) {
    return res.status(404).json({ error: "Položka nenalezena" });
  }

  writeData(next);
  res.json({ ok: true });
});

// DELETE /api/items  (smazat hotové)
router.delete("/", (req, res) => {
  const items = readData();
  const next = items.filter((it) => !it.done);
  writeData(next);
  res.json({ ok: true, deleted: items.length - next.length });
});

export default router;
