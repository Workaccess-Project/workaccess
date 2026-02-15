// backend/routes/alerts.js
import express from "express";
import { listExpirationsService } from "../services/alerts-service.js";

const router = express.Router();

/**
 * GET /api/alerts/expirations?days=30
 * READ for all roles (jen čtení)
 */
router.get("/expirations", async (req, res) => {
  const companyId = req.auth.companyId;
  const days = req.query?.days;

  const result = await listExpirationsService({ companyId, days });
  res.json(result);
});

export default router;
