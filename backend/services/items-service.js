// backend/services/items-service.js
import { readData, writeData } from "../data.js";
import { auditLog } from "../data-audit.js";

// helper: porovnání id robustně (string vs number)
function sameId(a, b) {
  return String(a) === String(b);
}

function normalizeText(v) {
  return (v ?? "").toString().trim();
}

/**
 * READ - list items
 */
export function listItems() {
  const items = readData();
  return Array.isArray(items) ? items : [];
}

/**
 * WRITE - create item
 */
export async function createItem({ actorRole, text }) {
  const items = listItems();

  const clean = normalizeText(text);
  if (!clean) {
    const err = new Error("Text je povinný");
    err.status = 400;
    throw err;
  }

  const newItem = {
    id: Date.now().toString(),
    text: clean,
    done: false,
  };

  items.push(newItem);
  writeData(items);

  await auditLog({
    actorRole,
    action: "item.create",
    entityType: "item",
    entityId: newItem.id,
    meta: {},
    before: null,
    after: newItem,
  });

  return newItem;
}

/**
 * WRITE - toggle done
 */
export async function toggleItemDone({ actorRole, id }) {
  const items = listItems();

  const idx = items.findIndex((it) => sameId(it.id, id));
  if (idx === -1) {
    const err = new Error("Položka nenalezena");
    err.status = 404;
    throw err;
  }

  const before = { ...items[idx] };

  items[idx].done = !items[idx].done;
  writeData(items);

  await auditLog({
    actorRole,
    action: "item.toggle",
    entityType: "item",
    entityId: String(id),
    meta: {},
    before,
    after: items[idx],
  });

  return items[idx];
}

/**
 * WRITE - update text
 */
export async function updateItemText({ actorRole, id, text }) {
  const items = listItems();

  const clean = normalizeText(text);
  if (!clean) {
    const err = new Error("Text je povinný");
    err.status = 400;
    throw err;
  }

  const idx = items.findIndex((it) => sameId(it.id, id));
  if (idx === -1) {
    const err = new Error("Položka nenalezena");
    err.status = 404;
    throw err;
  }

  const before = { ...items[idx] };

  items[idx].text = clean;
  writeData(items);

  await auditLog({
    actorRole,
    action: "item.updateText",
    entityType: "item",
    entityId: String(id),
    meta: {},
    before,
    after: items[idx],
  });

  return items[idx];
}

/**
 * WRITE - delete one item
 */
export async function deleteItemById({ actorRole, id }) {
  const items = listItems();

  const before = items.find((it) => sameId(it.id, id)) || null;
  const next = items.filter((it) => !sameId(it.id, id));

  if (next.length === items.length) {
    const err = new Error("Položka nenalezena");
    err.status = 404;
    throw err;
  }

  writeData(next);

  await auditLog({
    actorRole,
    action: "item.delete",
    entityType: "item",
    entityId: String(id),
    meta: {},
    before,
    after: null,
  });

  return { ok: true };
}

/**
 * WRITE - delete done items
 */
export async function deleteDoneItems({ actorRole }) {
  const items = listItems();
  const doneItems = items.filter((it) => !!it.done);
  const next = items.filter((it) => !it.done);

  writeData(next);

  await auditLog({
    actorRole,
    action: "item.deleteDone",
    entityType: "item",
    entityId: null,
    meta: { deleted: doneItems.length },
    before: doneItems,
    after: null,
  });

  return { ok: true, deleted: items.length - next.length };
}
