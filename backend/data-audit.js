// backend/data-audit.js
import { readTenantEntity, writeTenantEntity } from "./data/tenant-store.js";

const ENTITY = "audit";
const MAX_AUDIT = 5000;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "aud") {
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

/**
 * Přidá audit záznam (HARD TENANT)
 * companyId je POVINNÉ
 */
export async function auditLog({
  companyId,
  actorRole = "unknown",
  action = "unknown",
  entityType = "unknown",
  entityId = null,
  meta = {},
  before = null,
  after = null,
} = {}) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const e = new Error("Missing companyId for auditLog()");
    e.status = 400;
    throw e;
  }

  const arr = await readTenantEntity(cid, ENTITY);

  const entry = {
    id: makeId("aud"),
    ts: nowIso(),
    companyId: cid,
    actorRole: safeString(actorRole || "unknown"),
    action: safeString(action || "unknown"),
    entityType: safeString(entityType || "unknown"),
    entityId: entityId == null ? null : safeString(entityId),
    meta: meta && typeof meta === "object" ? meta : {},
    before,
    after,
  };

  arr.push(entry);

  const trimmed = arr.length > MAX_AUDIT ? arr.slice(arr.length - MAX_AUDIT) : arr;
  await writeTenantEntity(cid, ENTITY, trimmed);

  return entry;
}

/**
 * List audit (HARD TENANT) + filtry + cursor paging
 *
 * opts:
 *  - companyId (POVINNÉ)
 *  - limit (1..200) default 50
 *  - cursor: "ts|id" (vrací záznamy "před" kurzorem)
 *  - actorRole, action(prefix), entityType, entityId
 *  - from, to: date/time
 */
export async function listAuditV2(opts = {}) {
  const cid = safeString(opts.companyId).trim();
  if (!cid) {
    const e = new Error("Missing companyId for listAuditV2()");
    e.status = 400;
    throw e;
  }

  const limit = Math.max(1, Math.min(200, Number(opts.limit) || 50));

  const actorRole = opts.actorRole ? safeString(opts.actorRole).toLowerCase() : null;
  const action = opts.action ? safeString(opts.action) : null;
  const entityType = opts.entityType ? safeString(opts.entityType) : null;
  const entityId = opts.entityId != null ? safeString(opts.entityId) : null;

  const from = parseDateLike(opts.from);
  const to = parseDateLike(opts.to);

  const cursor = opts.cursor ? safeString(opts.cursor) : null;

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

  // filtry
  if (actorRole) items = items.filter((x) => safeString(x.actorRole).toLowerCase() === actorRole);
  if (entityType) items = items.filter((x) => safeString(x.entityType) === entityType);
  if (entityId != null) items = items.filter((x) => safeString(x.entityId) === entityId);

  if (action) items = items.filter((x) => safeString(x.action).startsWith(action));

  if (from) items = items.filter((x) => parseDateLike(x.ts)?.getTime() >= from.getTime());
  if (to) items = items.filter((x) => parseDateLike(x.ts)?.getTime() <= to.getTime());

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
