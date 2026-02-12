// backend/routes/audit.js
import express from "express";
import { requireRole } from "../auth.js";
import { listAuditV2 } from "../data-audit.js";

const router = express.Router();

function toCsvValue(v) {
  const s = (v ?? "").toString();
  const escaped = s.replaceAll('"', '""');
  return `"${escaped}"`;
}

function toCsv(rows) {
  const header = ["ts", "id", "actorRole", "action", "entityType", "entityId"].join(",");
  const lines = rows.map((x) =>
    [
      toCsvValue(x.ts),
      toCsvValue(x.id),
      toCsvValue(x.actorRole),
      toCsvValue(x.action),
      toCsvValue(x.entityType),
      toCsvValue(x.entityId ?? ""),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

/**
 * GET /api/audit
 * READ povoleno: hr, manager, security
 *
 * Query:
 *  - limit (1..200) default 50
 *  - cursor (ts|id)
 *  - actorRole
 *  - action (prefix)
 *  - entityType
 *  - entityId
 *  - from, to
 *  - format=json|csv
 */
router.get("/", requireRole(["hr", "manager", "security"]), async (req, res) => {
  const {
    limit,
    cursor,
    actorRole,
    action,
    entityType,
    entityId,
    from,
    to,
    format,
  } = req.query || {};

  const result = await listAuditV2({
    limit,
    cursor,
    actorRole,
    action,
    entityType,
    entityId,
    from,
    to,
  });

  const fmt = (format ?? "json").toString().toLowerCase();

  if (fmt === "csv") {
    const csv = toCsv(result.items);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=audit.csv");
    return res.send(csv);
  }

  res.json(result);
});

export default router;
