// backend/services/outbox-service.js
import { listOutbox } from "../data-outbox.js";

function safeString(v) {
  return (v ?? "").toString();
}

function requireCompanyId(companyId) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const err = new Error("Missing companyId (tenant context).");
    err.status = 400;
    throw err;
  }
  return cid;
}

export async function listOutboxService({ companyId, query } = {}) {
  const cid = requireCompanyId(companyId);
  const q = query || {};

  return await listOutbox({
    companyId: cid,
    limit: q.limit,
    cursor: q.cursor,
    to: q.to,
    documentId: q.documentId,
    from: q.from,
    toDate: q.toDate,
  });
}
