// backend/services/items-service.js
import { readData, writeData } from "../data.js";
import { auditLog } from "../data-audit.js";

function sameId(a, b) {
  return String(a) === String(b);
}

function normalizeText(v) {
  return (v ?? "").toString().trim();
}

function requireCompanyId(companyId) {
  const cid = (companyId ?? "").toString().trim();
  if (!cid) {
    const err = new Error("Missing companyId");
    err.status = 400;
    throw err;
  }
  return cid;
}

/**
 * READ - list items
 */
export async function listItems({ companyId }) {
  const cid = requireCompanyId(companyId);
  const items = await readData(cid);
  return Array.isArray(items) ? items : [];
}

/**
 * WRITE - create item
 */
export async function createItem({ companyId, actorRole, text }) {
  const cid = requireCompanyId(companyId);
  const items = await listItems({ companyId: cid });

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
  await writeData(cid, items);

  await auditLog({
    companyId: cid,
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

export async function toggleItemDone({ companyId, actorRole, id }) {
  const cid = requireCompanyId(companyId);
  const items = await listItems({ companyId: cid });

  const idx = items.findIndex((it) => sameId(it.id, id));
  if (idx === -1) {
    const err = new Error("Položka nenalezena");
    err.status = 404;
    throw err;
  }

  const before = { ...items[idx] };

  items[idx].done = !items[idx].done;
  await writeData(cid, items);

  await auditLog({
    companyId: cid,
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

export async function updateItemText({ companyId, actorRole, id, text }) {
  const cid = requireCompanyId(companyId);
  const items = await listItems({ companyId: cid });

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
  await writeData(cid, items);

  await auditLog({
    companyId: cid,
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

export async function deleteItemById({ companyId, actorRole, id }) {
  const cid = requireCompanyId(companyId);
  const items = await listItems({ companyId: cid });

  const before = items.find((it) => sameId(it.id, id)) || null;
  const next = items.filter((it) => !sameId(it.id, id));

  if (next.length === items.length) {
    const err = new Error("Položka nenalezena");
    err.status = 404;
    throw err;
  }

  await writeData(cid, next);

  await auditLog({
    companyId: cid,
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

export async function deleteDoneItems({ companyId, actorRole }) {
  const cid = requireCompanyId(companyId);
  const items = await listItems({ companyId: cid });

  const doneItems = items.filter((it) => !!it.done);
  const next = items.filter((it) => !it.done);

  await writeData(cid, next);

  await auditLog({
    companyId: cid,
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
