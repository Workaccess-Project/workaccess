// backend/data-outbox.js
import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";

const ENTITY = "outbox";
const MAX_OUTBOX = 5000;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "out") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function safeString(v) {
  return (v ?? "").toString();
}

function parseDateLike(v) {
  if (!v) return null;
  const d = new Date(String(v));
  if (String(d) === "Invalid Date") return null;
  return d;
}

export async function addOutboxEntry({
  companyId,
  to,
  subject,
  messagePreview,
  documentId,
  filename,
  transport,
  messageId,
} = {}) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const e = new Error("Missing companyId for addOutboxEntry()");
    e.status = 400;
    throw e;
  }

  const arr = await readTenantEntity(cid, ENTITY);

  const entry = {
    id: makeId("out"),
    ts: nowIso(),
    companyId: cid,
    to: safeString(to),
    subject: safeString(subject),
    messagePreview: safeString(messagePreview),
    documentId: safeString(documentId),
    filename: safeString(filename),
    transport: safeString(transport),
    messageId: safeString(messageId),
  };

  arr.push(entry);

  const trimmed = arr.length > MAX_OUTBOX ? arr.slice(arr.length - MAX_OUTBOX) : arr;
  await writeTenantEntity(cid, ENTITY, trimmed);

  return entry;
}

/**
 * List outbox with filters + cursor paging (similar to audit)
 *
 * opts:
 *  - companyId (required)
 *  - limit (1..200) default 50
 *  - cursor: "ts|id" (returns entries "before" cursor)
 *  - to (substring match)
 *  - documentId (exact)
 *  - from, toDate (date/time)
 */
export async function listOutbox(opts = {}) {
  const cid = safeString(opts.companyId).trim();
  if (!cid) {
    const e = new Error("Missing companyId for listOutbox()");
    e.status = 400;
    throw e;
  }

  const limit = Math.max(1, Math.min(200, Number(opts.limit) || 50));
  const cursor = opts.cursor ? safeString(opts.cursor) : null;

  const toFilter = opts.to ? safeString(opts.to).toLowerCase() : null;
  const documentId = opts.documentId ? safeString(opts.documentId) : null;

  const from = parseDateLike(opts.from);
  const toDate = parseDateLike(opts.toDate);

  const arr = await readTenantEntity(cid, ENTITY);

  // newest first
  let items = arr.slice().reverse();

  // cursor: "ts|id"
  if (cursor && cursor.includes("|")) {
    const [cTs, cId] = cursor.split("|");
    items = items.filter((x) => {
      const tsOk = safeString(x.ts) < safeString(cTs);
      if (tsOk) return true;
      if (safeString(x.ts) === safeString(cTs)) return safeString(x.id) < safeString(cId);
      return false;
    });
  }

  if (toFilter) items = items.filter((x) => safeString(x.to).toLowerCase().includes(toFilter));
  if (documentId) items = items.filter((x) => safeString(x.documentId) === documentId);

  if (from) items = items.filter((x) => parseDateLike(x.ts)?.getTime() >= from.getTime());
  if (toDate) items = items.filter((x) => parseDateLike(x.ts)?.getTime() <= toDate.getTime());

  const page = items.slice(0, limit);
  const last = page.length ? page[page.length - 1] : null;
  const nextCursor = last ? `${safeString(last.ts)}|${safeString(last.id)}` : null;

  return {
    companyId: cid,
    limit,
    count: page.length,
    nextCursor: page.length === limit ? nextCursor : null,
    items: page,
  };
}
