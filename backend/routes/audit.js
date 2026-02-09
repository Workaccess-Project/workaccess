// backend/routes/audit.js
import express from "express";
import { listAudit } from "../data-audit.js";
import { requireRole } from "../auth.js";

const router = express.Router();

/**
 * GET /api/audit?limit=200
 * READ povoleno: hr, manager, security
 * external -> 403
 */
router.get("/", requireRole(["hr", "manager", "security"]), async (req, res) => {
  const limit = Number(req.query.limit ?? 200) || 200;
  const items = await listAudit(limit);
  res.json({
    limit: Math.max(1, Math.min(1000, limit)),
    count: items.length,
    items,
  });
});

export default router;
