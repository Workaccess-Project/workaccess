// backend/routes/alerts.js
import express from "express";
import { requireWrite } from "../auth.js";
import {
  listExpirationsService,
  getAlertsConfigService,
  updateAlertsConfigService,
  sendAlertsDigestNowService,
} from "../services/alerts-service.js";

const router = express.Router();

/**
 * GET /api/alerts/expirations?days=30
 * READ for all roles
 */
router.get("/expirations", async (req, res) => {
  const companyId = req.auth.companyId;
  const days = req.query?.days;

  const result = await listExpirationsService({ companyId, days });
  res.json(result);
});

/**
 * GET /api/alerts/config
 * READ for all roles
 */
router.get("/config", async (req, res) => {
  const companyId = req.auth.companyId;
  const cfg = await getAlertsConfigService({ companyId });
  res.json(cfg);
});

/**
 * PUT /api/alerts/config
 * WRITE: hr/manager
 * body: { expirationsDays, digestEmail }
 */
router.put("/config", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;

    const updated = await updateAlertsConfigService({
      companyId,
      actorRole: req.role,
      body: req.body,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/alerts/digest/send-now
 * WRITE: hr/manager
 */
router.post("/digest/send-now", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;

    const result = await sendAlertsDigestNowService({
      companyId,
      actorRole: req.role,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
