// backend/routes/alerts.js
import express from "express";
import { requireWrite } from "../auth.js";
import {
  listExpirationsService,
  getAlertsConfigService,
  updateAlertsConfigService,
  sendAlertsDigestNowService,
} from "../services/alerts-service.js";
import { runDailyDigestJob } from "../services/digest-scheduler.js";

const router = express.Router();

router.get("/expirations", async (req, res) => {
  const companyId = req.auth.companyId;
  const days = req.query?.days;
  const result = await listExpirationsService({ companyId, days });
  res.json(result);
});

router.get("/config", async (req, res) => {
  const companyId = req.auth.companyId;
  const cfg = await getAlertsConfigService({ companyId });
  res.json(cfg);
});

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

/**
 * DEV helper: ručně spustí denní job přes všechny tenanty.
 * WRITE: hr/manager (ať to nejde “external”)
 */
router.post("/digest/run-job", requireWrite, async (req, res) => {
  const result = await runDailyDigestJob({ actorRole: req.role });
  res.json(result);
});

export default router;
